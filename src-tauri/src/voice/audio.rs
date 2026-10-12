use rubato::{FftFixedInOut, Resampler};
use std::{fs::File, io::Read, path::Path};
use symphonia::core::{
    audio::SampleBuffer, codecs::DecoderOptions, errors::Error, formats::FormatOptions,
    io::MediaSourceStream, meta::MetadataOptions, probe::Hint,
};

pub const SAMPLE_RATE: u32 = 16000;
pub const MAX_BYTES: u64 = 100 * 1024 * 1024;
pub fn validate_signature(path: &Path, extension: &str) -> Result<(), String> {
    let mut header = [0u8; 12];
    let n = File::open(path)
        .map_err(|_| "Audio unavailable")?
        .read(&mut header)
        .map_err(|_| "Audio unavailable")?;
    let valid = match extension {
        "wav" => n == 12 && &header[..4] == b"RIFF" && &header[8..12] == b"WAVE",
        "m4a" => n == 12 && &header[4..8] == b"ftyp",
        "ogg" => n >= 4 && &header[..4] == b"OggS",
        "mp3" => {
            n >= 3 && (&header[..3] == b"ID3" || (header[0] == 0xff && header[1] & 0xe0 == 0xe0))
        }
        _ => false,
    };
    if valid {
        Ok(())
    } else {
        Err("Audio contents do not match the declared file type.".into())
    }
}
pub fn convert(path: &Path, output: &Path, cancelled: impl Fn() -> bool) -> Result<u64, String> {
    let file = File::open(path).map_err(|_| "Audio file could not be opened")?;
    if file.metadata().map_err(|_| "Audio file unavailable")?.len() > MAX_BYTES {
        return Err("Audio file is too large (100 MB maximum).".into());
    }
    let source = MediaSourceStream::new(Box::new(file), Default::default());
    let mut format = symphonia::default::get_probe()
        .format(
            &Hint::new(),
            source,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|_| "Audio format unsupported. Choose WAV, MP3, M4A or OGG/Vorbis.")?
        .format;
    let track = format.default_track().ok_or("No audio track found")?;
    let id = track.id;
    let rate = track
        .codec_params
        .sample_rate
        .ok_or("Unknown audio sample rate")?;
    if !(8000..=192000).contains(&rate) {
        return Err("Unsupported sample rate".into());
    }
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|_| "Audio codec unsupported")?;
    let mut mono = Vec::new();
    loop {
        if cancelled() {
            return Err("Processing cancelled".into());
        }
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(Error::IoError(e)) if e.kind() == std::io::ErrorKind::UnexpectedEof => break,
            Err(_) => return Err("Audio file is damaged".into()),
        };
        if packet.track_id() != id {
            continue;
        }
        let audio = decoder
            .decode(&packet)
            .map_err(|_| "Audio file could not be decoded")?;
        if audio.spec().rate != rate {
            return Err("Changing sample rates are unsupported".into());
        }
        let channels = audio.spec().channels.count();
        if channels == 0 || channels > 8 {
            return Err("Unsupported channel count".into());
        }
        let mut samples = SampleBuffer::<f32>::new(audio.capacity() as u64, *audio.spec());
        samples.copy_interleaved_ref(audio);
        for frame in samples.samples().chunks(channels) {
            mono.push(frame.iter().copied().sum::<f32>() / channels as f32);
        }
        if mono.len() > rate as usize * 900 {
            return Err("Audio is longer than 15 minutes".into());
        }
    }
    if mono.is_empty() {
        return Err("No clear speech was detected.".into());
    }
    let duration = mono.len() as u64 * 1000 / rate as u64;
    let samples = resample(&mono, rate)?;
    write_wav(output, &samples)?;
    Ok(duration)
}
pub fn check_signal(path: &Path, cancelled: impl Fn() -> bool) -> Result<(), String> {
    let mut reader = hound::WavReader::open(path).map_err(|_| "Audio could not be read")?;
    let mut sum = 0.0_f64;
    let mut peak = 0.0_f64;
    let mut count = 0_u64;
    for sample in reader.samples::<i16>() {
        if count.is_multiple_of(16000) && cancelled() {
            return Err("Processing cancelled".into());
        }
        let value = sample.map_err(|_| "Audio is damaged")? as f64 / 32768.0;
        sum += value * value;
        peak = peak.max(value.abs());
        count += 1;
    }
    if count == 0 || ((sum / count as f64).sqrt() < 0.0003 && peak < 0.001) {
        return Err(
            "No clear speech was detected. Record closer to the microphone or import another file."
                .into(),
        );
    }
    Ok(())
}
pub fn resample(input: &[f32], rate: u32) -> Result<Vec<f32>, String> {
    if rate == SAMPLE_RATE {
        return Ok(input.to_vec());
    }
    let mut converter = FftFixedInOut::<f32>::new(rate as usize, SAMPLE_RATE as usize, 1024, 1)
        .map_err(|_| "Cannot convert audio")?;
    let size = converter.input_frames_next();
    let delay = converter.output_delay();
    let target = (input.len() as u64 * SAMPLE_RATE as u64 / rate as u64) as usize;
    let mut output = Vec::new();
    for chunk in input.chunks(size).chain(std::iter::once(&[][..])) {
        let mut block = vec![0.0; size];
        block[..chunk.len()].copy_from_slice(chunk);
        let result = converter
            .process(&[block], None)
            .map_err(|_| "Cannot resample audio")?;
        output.extend_from_slice(&result[0]);
    }
    if output.len() < delay + target {
        output.resize(delay + target, 0.0);
    }
    Ok(output[delay..delay + target].to_vec())
}
pub fn write_wav(path: &Path, samples: &[f32]) -> Result<(), String> {
    let mut writer = hound::WavWriter::create(
        path,
        hound::WavSpec {
            channels: 1,
            sample_rate: SAMPLE_RATE,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        },
    )
    .map_err(|_| "Cannot create temporary audio")?;
    for value in samples {
        writer
            .write_sample((value.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
            .map_err(|_| "Cannot write audio")?;
    }
    writer
        .finalize()
        .map_err(|_| "Cannot finalize audio".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn silent_audio_is_rejected_before_inference() {
        let file =
            std::env::temp_dir().join(format!("tasklens-silence-{}.wav", uuid::Uuid::new_v4()));
        write_wav(&file, &vec![0.0; 16000]).unwrap();
        assert!(check_signal(&file, || false)
            .unwrap_err()
            .contains("No clear speech"));
        write_wav(&file, &vec![0.1; 16000]).unwrap();
        assert!(check_signal(&file, || false).is_ok());
        assert!(check_signal(&file, || true)
            .unwrap_err()
            .contains("cancelled"));
        std::fs::remove_file(file).unwrap();
    }
    #[test]
    fn converts_duration_and_amplitude() {
        let values = resample(&vec![0.25; 48000], 48000).unwrap();
        assert_eq!(values.len(), 16000);
        assert!((values[8000] - 0.25).abs() < 0.01);
    }
}

#[cfg(test)]
mod file_tests {
    use super::*;
    #[test]
    #[ignore = "requires scripts/generate-audio-fixtures.mjs and TASKLENS_CODEC_FIXTURES"]
    fn supported_codecs_decode_and_opus_webm_are_rejected() {
        let folder = std::path::PathBuf::from(std::env::var("TASKLENS_CODEC_FIXTURES").unwrap());
        let output =
            std::env::temp_dir().join(format!("tasklens-codecs-{}.wav", uuid::Uuid::new_v4()));
        for name in [
            "sample.wav",
            "sample.mp3",
            "sample-aac.m4a",
            "sample-alac.m4a",
            "sample.ogg",
        ] {
            let file = folder.join(name);
            let original = std::fs::read(&file).unwrap();
            validate_signature(&file, file.extension().unwrap().to_str().unwrap()).unwrap();
            let duration = convert(&file, &output, || false).unwrap();
            assert!((900..=1300).contains(&duration), "{name}: {duration}");
            check_signal(&output, || false).unwrap();
            assert_eq!(std::fs::read(file).unwrap(), original);
        }
        for name in ["unsupported.ogg", "unsupported.webm"] {
            assert!(convert(&folder.join(name), &output, || false).is_err());
        }
        std::fs::remove_file(output).unwrap();
    }
    #[test]
    fn decoded_import_remains_untouched_and_cancel_is_observed() {
        let folder =
            std::env::temp_dir().join(format!("tasklens-audio-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&folder).unwrap();
        let original = folder.join("original.wav");
        let converted = folder.join("converted.wav");
        write_wav(&original, &vec![0.25; 16000]).unwrap();
        let before = std::fs::read(&original).unwrap();
        assert!(validate_signature(&original, "wav").is_ok());
        assert!(validate_signature(&original, "mp3").is_err());
        assert_eq!(convert(&original, &converted, || false).unwrap(), 1000);
        assert_eq!(std::fs::read(&original).unwrap(), before);
        assert!(convert(&original, &converted, || true)
            .unwrap_err()
            .contains("cancelled"));
        std::fs::write(folder.join("invalid.wav"), b"not audio").unwrap();
        assert!(convert(&folder.join("invalid.wav"), &converted, || false).is_err());
        std::fs::remove_dir_all(folder).unwrap();
    }
}
