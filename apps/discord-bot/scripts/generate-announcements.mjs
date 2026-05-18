#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(scriptDir, '..');
const assetsRoot = join(packageRoot, 'assets', 'announcements');

const VARIANT = process.env.ESPEAK_VARIANT?.trim() || 'f3';
const SPEED = process.env.ESPEAK_SPEED?.trim() || '150';

const COPY = {
  it: {
    'recording-start': 'Comincio a registrare, buona giocata!',
    'recording-stop': 'Ho finito di registrare, ciao a tutti!',
  },
  en: {
    'recording-start': "I'm starting to record, have a great game!",
    'recording-stop': "I've finished recording, goodbye everyone!",
  },
  fr: {
    'recording-start': 'Je commence à enregistrer, bonne partie !',
    'recording-stop': "J'ai fini d'enregistrer, à bientôt !",
  },
  es: {
    'recording-start': 'Empiezo a grabar, ¡buena partida!',
    'recording-stop': 'He terminado de grabar, ¡hasta luego!',
  },
};

const BASE_VOICE = {
  it: 'it',
  en: 'en-gb',
  fr: 'fr-fr',
  es: 'es',
};

function requireCmd(cmd) {
  const r = spawnSync('which', [cmd], { encoding: 'utf8' });
  if (r.status !== 0 || !r.stdout.trim()) {
    console.error(`Missing required command: ${cmd}`);
    process.exit(1);
  }
}

function assertVariantExists() {
  const r = spawnSync('espeak-ng', ['--voices=variant'], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('espeak-ng --voices=variant failed');
    process.exit(1);
  }
  const needle = new RegExp(`\\s${VARIANT}\\s`, 'i');
  if (!needle.test(r.stdout) && !r.stdout.toLowerCase().includes(`!v/${VARIANT.toLowerCase()}`)) {
    console.error(
      `espeak variant "${VARIANT}" not found. Run: espeak-ng --voices=variant\n` +
        'Set ESPEAK_VARIANT to an installed variant (default f3).',
    );
    process.exit(1);
  }
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

async function main() {
  requireCmd('espeak-ng');
  requireCmd('ffmpeg');
  assertVariantExists();

  await rm(assetsRoot, { recursive: true, force: true });

  for (const [locale, texts] of Object.entries(COPY)) {
    const voice = `${BASE_VOICE[locale]}+${VARIANT}`;
    const outDir = join(assetsRoot, locale);
    await mkdir(outDir, { recursive: true });

    for (const [kind, text] of Object.entries(texts)) {
      const wav = join(outDir, `${kind}.wav`);
      const ogg = join(outDir, `${kind}.ogg`);
      run('espeak-ng', ['-v', voice, '-s', SPEED, '-w', wav, text]);
      run('ffmpeg', [
        '-y',
        '-i',
        wav,
        '-ar',
        '48000',
        '-ac',
        '2',
        '-c:a',
        'libopus',
        '-b:a',
        '64k',
        '-vbr',
        'on',
        '-application',
        'voip',
        ogg,
      ]);
      await rm(wav, { force: true });
      console.log(`wrote ${ogg} (${voice})`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
