//! Local OCR through Tesseract 5.x.
//!
//! The webview sends the screenshot bytes over IPC (it has no filesystem path for dropped
//! or pasted images). Bytes are decoded, preprocessed into a temporary PNG and recognised
//! by the Tesseract CLI with structured arguments. The user's original file is never read
//! or modified. Output is line-level regions with confidence and bounding boxes in the
//! original image's pixel coordinates, which Source Trace uses for highlighting.
use crate::{jobs::Jobs, platform};
use image::{imageops::FilterType, DynamicImage, GrayImage, ImageDecoder, ImageFormat};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    fs,
    io::Cursor,
    path::{Path, PathBuf},
    time::Duration,
};
use tauri::{ipc::InvokeBody, Emitter, Manager};

pub const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;
const MAX_SIDE: u32 = 16_000;
const MAX_REGIONS: usize = 600;
const MAX_TEXT: usize = 60_000;
/// Configured recognition languages. English is required; Cebuano and Tagalog are used when
/// their trained data is installed. Text is never translated.
pub const LANGUAGES: [&str; 3] = ["eng", "ceb", "tgl"];

#[derive(Debug, Clone, PartialEq)]
pub struct Region {
    pub id: String,
    pub text: String,
    pub confidence: f32,
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
    pub block: u32,
    pub paragraph: u32,
}

/// Image preparation is isolated so it can be tuned (or disabled) without touching OCR.
pub trait Preprocessor {
    /// Returns the image to recognise and the scale factor from original to prepared pixels.
    fn prepare(&self, image: &DynamicImage) -> (GrayImage, f32);
}

/// Conservative screenshot preparation: grayscale plus moderate upscaling of small images,
/// which noticeably helps Tesseract with UI-sized text. No thresholding or sharpening.
pub struct ScreenshotPreprocessor;

impl Preprocessor for ScreenshotPreprocessor {
    fn prepare(&self, image: &DynamicImage) -> (GrayImage, f32) {
        let gray = image.to_luma8();
        let longest = gray.width().max(gray.height()) as f32;
        let scale = if longest < 1800.0 {
            (1800.0 / longest).min(2.0)
        } else if longest > 6000.0 {
            6000.0 / longest
        } else {
            1.0
        };
        if (scale - 1.0).abs() < 0.05 {
            return (gray, 1.0);
        }
        let width = ((gray.width() as f32) * scale).round().max(1.0) as u32;
        let height = ((gray.height() as f32) * scale).round().max(1.0) as u32;
        (
            image::imageops::resize(&gray, width, height, FilterType::CatmullRom),
            scale,
        )
    }
}

fn decode(bytes: &[u8]) -> Result<DynamicImage, String> {
    let unreadable = || "This image could not be read. Try exporting it as PNG or JPG.".to_string();
    let mut reader = image::ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| unreadable())?;
    match reader.format() {
        Some(ImageFormat::Png | ImageFormat::Jpeg | ImageFormat::WebP) => {}
        _ => return Err("Choose a PNG, JPG, JPEG, or WEBP image.".into()),
    }
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(MAX_SIDE);
    limits.max_image_height = Some(MAX_SIDE);
    limits.max_alloc = Some(768 * 1024 * 1024);
    reader.limits(limits);
    let mut decoder = reader.into_decoder().map_err(|_| unreadable())?;
    let orientation = decoder.orientation().ok();
    let mut image = DynamicImage::from_decoder(decoder).map_err(|_| unreadable())?;
    if let Some(orientation) = orientation {
        image.apply_orientation(orientation);
    }
    if image.width() < 8 || image.height() < 8 {
        return Err("This image is too small to read.".into());
    }
    Ok(image)
}

pub struct Installation {
    pub binary: Option<PathBuf>,
    pub tessdata: Option<PathBuf>,
    pub languages: Vec<String>,
}

fn has_language(dir: &Path, lang: &str) -> bool {
    dir.join(format!("{lang}.traineddata")).is_file()
}

pub fn installation(app: &tauri::AppHandle) -> Installation {
    let binary = platform::tesseract_binary(app);
    let tessdata = platform::tessdata_candidates(app, binary.as_deref())
        .into_iter()
        .find(|dir| has_language(dir, "eng"));
    let languages = tessdata
        .as_ref()
        .map(|dir| {
            LANGUAGES
                .iter()
                .filter(|l| has_language(dir, l))
                .map(|l| l.to_string())
                .collect()
        })
        .unwrap_or_default();
    Installation {
        binary,
        tessdata,
        languages,
    }
}

fn version(binary: &Path) -> Option<String> {
    let output = platform::command(binary).arg("--version").output().ok()?;
    let text = String::from_utf8_lossy(&output.stdout).to_string()
        + &String::from_utf8_lossy(&output.stderr);
    text.lines()
        .next()
        .map(|l| l.trim().to_string())
        .filter(|l| l.to_lowercase().starts_with("tesseract"))
}

pub fn status(app: &tauri::AppHandle) -> Value {
    let install = installation(app);
    json!({
        "available": install.binary.is_some() && install.tessdata.is_some(),
        "binaryFound": install.binary.is_some(),
        "version": install.binary.as_deref().and_then(version),
        "dataDirectory": install.tessdata.as_ref().map(|p| p.to_string_lossy().to_string()),
        "languages": LANGUAGES.iter().map(|l| json!({"code": l, "installed": install.languages.iter().any(|x| x == l)})).collect::<Vec<_>>(),
    })
}

/// Parses Tesseract TSV into line regions, scaling boxes back to original pixels.
pub fn parse_tsv(tsv: &str, scale: f32) -> Vec<Region> {
    struct Line {
        words: Vec<String>,
        conf: Vec<f32>,
        left: u32,
        top: u32,
        right: u32,
        bottom: u32,
        block: u32,
        paragraph: u32,
    }
    let mut lines: BTreeMap<(u32, u32, u32, u32), Line> = BTreeMap::new();
    for row in tsv.lines().skip(1) {
        let cols: Vec<&str> = row.splitn(12, '\t').collect();
        if cols.len() < 12 || cols[0] != "5" {
            continue;
        }
        let num = |i: usize| cols[i].trim().parse::<i64>().unwrap_or(-1);
        let conf: f32 = cols[10].trim().parse().unwrap_or(-1.0);
        let text = cols[11].trim();
        if text.is_empty() || conf < 0.0 {
            continue;
        }
        let (left, top, width, height) = (num(6), num(7), num(8), num(9));
        if left < 0 || top < 0 || width <= 0 || height <= 0 {
            continue;
        }
        let key = (num(1) as u32, num(2) as u32, num(3) as u32, num(4) as u32);
        let line = lines.entry(key).or_insert(Line {
            words: vec![],
            conf: vec![],
            left: u32::MAX,
            top: u32::MAX,
            right: 0,
            bottom: 0,
            block: key.1,
            paragraph: key.2,
        });
        line.words.push(text.to_string());
        line.conf.push(conf);
        line.left = line.left.min(left as u32);
        line.top = line.top.min(top as u32);
        line.right = line.right.max((left + width) as u32);
        line.bottom = line.bottom.max((top + height) as u32);
    }
    let unscale = |v: u32| ((v as f32) / scale).round() as u32;
    let mut total = 0;
    let mut regions = Vec::new();
    for line in lines.into_values() {
        let text = line.words.join(" ");
        if !text.chars().any(|c| c.is_alphanumeric()) {
            continue;
        }
        total += text.len();
        if regions.len() >= MAX_REGIONS || total > MAX_TEXT {
            break;
        }
        let confidence = line.conf.iter().sum::<f32>() / line.conf.len() as f32 / 100.0;
        regions.push(Region {
            id: format!("r{}", regions.len() + 1),
            text,
            confidence: (confidence * 1000.0).round() / 1000.0,
            x: unscale(line.left),
            y: unscale(line.top),
            width: unscale(line.right - line.left).max(1),
            height: unscale(line.bottom - line.top).max(1),
            block: line.block,
            paragraph: line.paragraph,
        });
    }
    regions
}

pub fn full_text(regions: &[Region]) -> String {
    let mut out = String::new();
    let mut block = None;
    for region in regions {
        if block.is_some() && block != Some(region.block) {
            out.push('\n');
        }
        block = Some(region.block);
        out.push_str(&region.text);
        out.push('\n');
    }
    out.trim_end().to_string()
}

pub struct Engine {
    pub binary: PathBuf,
    pub tessdata: PathBuf,
    pub languages: Vec<String>,
}

/// The OCR pipeline without any Tauri dependency: decode, preprocess, recognise, parse.
/// `folder` is a private temporary directory that the caller removes afterwards.
pub fn recognize_bytes(
    engine: &Engine,
    bytes: &[u8],
    folder: &Path,
    cancel: &std::sync::atomic::AtomicBool,
    progress: impl Fn(&str),
) -> Result<Value, String> {
    progress("preparing_image");
    let image = decode(bytes)?;
    let (width, height) = (image.width(), image.height());
    let (prepared, scale) = ScreenshotPreprocessor.prepare(&image);
    drop(image);
    let input = folder.join("input.png");
    prepared
        .save_with_format(&input, ImageFormat::Png)
        .map_err(|_| platform::GENERIC_ERROR.to_string())?;
    drop(prepared);
    if cancel.load(std::sync::atomic::Ordering::SeqCst) {
        return Err(platform::CANCELLED.to_string());
    }
    progress("reading_text");
    let args: Vec<String> = vec![
        input.to_string_lossy().into(),
        folder.join("out").to_string_lossy().into(),
        "--tessdata-dir".into(),
        engine.tessdata.to_string_lossy().into(),
        "-l".into(),
        engine.languages.join("+"),
        "--psm".into(),
        "3".into(),
        "-c".into(),
        "tessedit_create_tsv=1".into(),
        "-c".into(),
        "tessedit_create_txt=0".into(),
    ];
    platform::run_to_file(
        &engine.binary,
        &args,
        &folder.join("stdout.txt"),
        cancel,
        platform::Limits {
            timeout: Duration::from_secs(180),
            max_output_bytes: 1_000_000,
        },
    )?;
    let tsv = fs::read_to_string(folder.join("out.tsv"))
        .map_err(|_| "Text recognition produced no output.".to_string())?;
    let regions = parse_tsv(&tsv, scale);
    Ok(json!({
        "fullText": full_text(&regions),
        "regions": regions.iter().map(|r| json!({
            "id": r.id,
            "text": r.text,
            "confidence": (r.confidence as f64 * 1000.0).round() / 1000.0,
            "box": {"x": r.x, "y": r.y, "width": r.width, "height": r.height},
            "block": r.block,
            "paragraph": r.paragraph,
        })).collect::<Vec<_>>(),
        "languages": engine.languages,
        "imageWidth": width,
        "imageHeight": height,
        "engine": version(&engine.binary).unwrap_or_else(|| "tesseract".into()),
    }))
}

fn recognize(app: &tauri::AppHandle, id: &str, bytes: Vec<u8>) -> Result<Value, String> {
    let jobs = app.state::<Jobs>();
    let job = jobs.register(id)?;
    let install = installation(app);
    let engine = match (install.binary, install.tessdata) {
        (Some(binary), Some(tessdata)) => Engine {
            binary,
            tessdata,
            languages: install.languages,
        },
        _ => {
            return Err(
                "OCR_NOT_INSTALLED: Local text recognition (Tesseract) is not installed.".into(),
            )
        }
    };
    let folder = platform::app_data(app)?.join("ocr-jobs").join(id);
    fs::create_dir_all(&folder).map_err(|_| platform::GENERIC_ERROR.to_string())?;
    let result = recognize_bytes(&engine, &bytes, &folder, &job.cancel, |stage| {
        let _ = app.emit("local-ai-progress", json!({"jobId": id, "stage": stage}));
    });
    let _ = fs::remove_dir_all(&folder);
    result
}

fn check_window(window: &tauri::Window) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("Local processing is available only in the main window.".into())
    }
}

#[tauri::command]
pub async fn ocr_recognize(
    window: tauri::Window,
    app: tauri::AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<Value, String> {
    check_window(&window)?;
    let id = request
        .headers()
        .get("x-tasklens-job")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .to_string();
    crate::jobs::valid_id(&id)?;
    let bytes = match request.body() {
        InvokeBody::Raw(bytes) => bytes.clone(),
        _ => return Err("Send the image as binary data.".into()),
    };
    if bytes.is_empty() || bytes.len() > MAX_IMAGE_BYTES {
        return Err("This image is too large. Choose an image smaller than 10 MB.".into());
    }
    tauri::async_runtime::spawn_blocking(move || recognize(&app, &id, bytes))
        .await
        .map_err(|_| platform::GENERIC_ERROR.to_string())?
}

#[tauri::command]
pub async fn ocr_status(window: tauri::Window, app: tauri::AppHandle) -> Result<Value, String> {
    check_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || status(&app))
        .await
        .map_err(|_| platform::GENERIC_ERROR.to_string())
}

/// Copies user-selected `eng/ceb/tgl.traineddata` files into the app data `tessdata`
/// directory. When English is only available from a system install, it is copied too so
/// all configured languages share one data directory.
#[tauri::command]
pub async fn ocr_import_languages(
    window: tauri::Window,
    app: tauri::AppHandle,
) -> Result<Value, String> {
    check_window(&window)?;
    let files = rfd::AsyncFileDialog::new()
        .set_title("Import Tesseract language data (eng, ceb, tgl)")
        .add_filter("Tesseract trained data", &["traineddata"])
        .pick_files()
        .await
        .ok_or("Language import cancelled.")?;
    let paths: Vec<PathBuf> = files.iter().map(|f| f.path().to_path_buf()).collect();
    tauri::async_runtime::spawn_blocking(move || {
        let target = platform::app_data(&app)?.join("tessdata");
        fs::create_dir_all(&target).map_err(|_| platform::GENERIC_ERROR.to_string())?;
        for path in &paths {
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default();
            let lang = name.strip_suffix(".traineddata").unwrap_or_default();
            if !LANGUAGES.contains(&lang) {
                return Err(format!(
                    "“{name}” is not a supported language file. Choose eng, ceb or tgl.traineddata."
                ));
            }
            let size = platform::file_size(path).unwrap_or(0);
            if !(100_000..=200_000_000).contains(&size) {
                return Err(format!(
                    "“{name}” does not look like Tesseract language data."
                ));
            }
            fs::copy(path, target.join(name)).map_err(|_| format!("Could not copy “{name}”."))?;
        }
        if !has_language(&target, "eng") {
            let binary = platform::tesseract_binary(&app);
            if let Some(source) = platform::tessdata_candidates(&app, binary.as_deref())
                .into_iter()
                .skip(1)
                .find(|dir| has_language(dir, "eng"))
            {
                fs::copy(
                    source.join("eng.traineddata"),
                    target.join("eng.traineddata"),
                )
                .map_err(|_| "Could not copy English language data.".to_string())?;
            }
        }
        Ok(status(&app))
    })
    .await
    .map_err(|_| platform::GENERIC_ERROR.to_string())?
}

pub fn initialize(app: &tauri::AppHandle) -> Result<(), String> {
    let jobs = platform::app_data(app)?.join("ocr-jobs");
    if jobs.exists() {
        let _ = fs::remove_dir_all(&jobs);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    const TSV: &str = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext
1\t1\t0\t0\t0\t0\t0\t0\t1600\t900\t-1\t
4\t1\t1\t1\t1\t0\t100\t40\t400\t30\t-1\t
5\t1\t1\t1\t1\t1\t100\t40\t180\t30\t96.5\tMga
5\t1\t1\t1\t1\t2\t300\t42\t200\t28\t91.5\t1:30PM
5\t1\t1\t1\t2\t1\t100\t90\t120\t30\t-1\t
5\t1\t2\t1\t1\t1\t100\t200\t240\t30\t88\tkinahanglan
5\t1\t2\t1\t1\t2\t360\t200\t10\t30\t20\t|
";
    #[test]
    fn groups_words_into_scaled_lines() {
        let regions = parse_tsv(TSV, 2.0);
        assert_eq!(regions.len(), 2);
        assert_eq!(regions[0].id, "r1");
        assert_eq!(regions[0].text, "Mga 1:30PM");
        assert_eq!((regions[0].x, regions[0].y), (50, 20));
        assert_eq!((regions[0].width, regions[0].height), (200, 15));
        assert!((regions[0].confidence - 0.94).abs() < 0.001);
        assert_eq!(regions[1].text, "kinahanglan |");
        assert_eq!(full_text(&regions), "Mga 1:30PM\n\nkinahanglan |");
    }
    #[test]
    fn preprocessing_upscales_small_screenshots_only() {
        let small = DynamicImage::new_rgb8(600, 300);
        let (img, scale) = ScreenshotPreprocessor.prepare(&small);
        assert_eq!(scale, 2.0);
        assert_eq!(img.width(), 1200);
        let (_, scale) = ScreenshotPreprocessor.prepare(&DynamicImage::new_rgb8(2400, 1200));
        assert_eq!(scale, 1.0);
    }
    /// Real OCR on the rendered fixtures. Run with:
    /// TASKLENS_TESSERACT=<tesseract> TASKLENS_TESSDATA=<dir> cargo test -- --ignored ocr_fixtures
    #[test]
    #[ignore]
    fn ocr_fixtures() {
        let engine = Engine {
            binary: std::env::var("TASKLENS_TESSERACT").unwrap().into(),
            tessdata: std::env::var("TASKLENS_TESSDATA").unwrap().into(),
            languages: LANGUAGES.iter().map(|l| l.to_string()).collect(),
        };
        let fixtures = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/screenshots");
        let out = fixtures.join("ocr");
        fs::create_dir_all(&out).unwrap();
        for name in [
            "pictorial",
            "midterm",
            "bundle-english",
            "cebuano-mixed",
            "tagalog-mixed",
            "tagalog",
        ] {
            let bytes = fs::read(fixtures.join(format!("{name}.png"))).unwrap();
            let folder = std::env::temp_dir().join(format!("tasklens-ocr-{name}"));
            fs::create_dir_all(&folder).unwrap();
            let started = std::time::Instant::now();
            let doc =
                recognize_bytes(&engine, &bytes, &folder, &Default::default(), |_| {}).unwrap();
            let _ = fs::remove_dir_all(&folder);
            println!(
                "== {name} ({} ms)
{}",
                started.elapsed().as_millis(),
                doc["fullText"].as_str().unwrap()
            );
            assert!(!doc["regions"].as_array().unwrap().is_empty());
            fs::write(
                out.join(format!("{name}.json")),
                serde_json::to_string_pretty(&doc).unwrap(),
            )
            .unwrap();
        }
    }
    #[test]
    fn rejects_unsupported_formats() {
        assert!(decode(b"GIF89a....").is_err());
        assert!(decode(&[]).is_err());
    }
}
