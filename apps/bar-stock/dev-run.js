import { exec } from 'child_process';
const log = [];
const proc = exec('npm run dev -- --host 127.0.0.1 --port 5173 --strictPort');
proc.stdout?.on('data', (chunk) => log.push(chunk.toString()));
proc.stderr?.on('data', (chunk) => log.push(chunk.toString()));
setTimeout(() => proc.kill(), 5000);
proc.on('close', () => {
  process.stdout.write(log.join(''));
});
