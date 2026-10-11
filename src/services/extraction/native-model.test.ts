import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { extractionPrompt, extractionJsonSchema, parseExtraction } from './LocalExtractionService';
import { phrases, transcript } from '../../../tests/fixtures/voice';
const run=promisify(execFile);
it.skipIf(!process.env.TASKLENS_NATIVE_MODELS)('real local Qwen preserves the four semantic fixtures',async()=>{
  const folder=await mkdtemp(path.join(tmpdir(),'tasklens-model-test-'));
  try {
    await writeFile(path.join(folder,'schema.json'),JSON.stringify(extractionJsonSchema));
    for(let i=0;i<4;i++) {
      const source={type:'voice' as const,transcript:transcript(phrases[i]),capturedAt:'2026-10-11T04:00:00.000Z',timezone:'Asia/Manila'};
      await writeFile(path.join(folder,'prompt.txt'),extractionPrompt(source));
      const start=performance.now();
      const {stdout}=await run(path.resolve('src-tauri/resources/bin/llama-completion'),['-m',path.resolve('.local-ai/models/Qwen3-4B-Q4_K_M.gguf'),'-f',path.join(folder,'prompt.txt'),'-jf',path.join(folder,'schema.json'),'-n','4096','-c','32768','-ngl','0','--temp','0','--no-display-prompt','--no-conversation','--simple-io'],{timeout:600000,maxBuffer:2_000_000});
      const result=parseExtraction(stdout,source);
      console.info(`Native fixture ${i+1}: ${((performance.now()-start)/1000).toFixed(1)} seconds, ${result.actions.length} actions`);
      if(i===0){expect(result.actions).toHaveLength(1);expect(result.actions[0].time).toBe('09:00');expect(new Date(result.actions[0].reminders[0].datetime).getHours()).toBe(8);expect(result.actions[0].requirements.join(' ').toLowerCase()).toContain('calculator');}
      if(i===1){expect(result.actions[0].arrivalTime).toBe('13:30');expect(result.actions[0].time || '').toBe('');}
      if(i===2){expect(result.actions).toHaveLength(2);expect(result.actions.find(a=>a.type==='deadline')?.time).toBe('17:00');expect(result.actions.find(a=>a.type==='event')?.time).toBe('14:00');}
      if(i===3){expect(result.actions).toHaveLength(0);expect(result.ambiguities.length).toBeGreaterThan(0);}
    }
  } finally {await rm(folder,{recursive:true,force:true});}
},2400000);
