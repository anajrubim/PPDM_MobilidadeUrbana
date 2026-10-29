/// <reference types="node" />
import fs from 'node:fs';
import path from 'node:path';
import config from '../app.config';

const root = path.join(__dirname, '..');

/**
 * US31 — compatibilidade Android. O React Native 0.86 (Expo 57) exige Android 7.0 (API 24): o mínimo fica
 * declarado e conferido aqui e no projeto nativo versionado. Decisão e alternativas: docs/adr/ADR-001-android-minimo.md
 */
describe('US31 — versão mínima do Android', () => {
  it('app.config declara minSdk 24 (Android 7.0)', () => {
    const props = (config.plugins ?? []).find((p) => Array.isArray(p) && p[0] === 'expo-build-properties') as [string, { android: { minSdkVersion: number } }];
    expect(props[1].android.minSdkVersion).toBe(24);
  });

  it('o projeto Android versionado usa o mesmo mínimo e a versão do app', () => {
    expect(fs.readFileSync(path.join(root, 'android', 'gradle.properties'), 'utf8')).toMatch(/^android\.minSdkVersion=24$/m);
    const gradle = fs.readFileSync(path.join(root, 'android', 'app', 'build.gradle'), 'utf8');
    expect(gradle).toContain(`versionName "${config.version}"`);
    expect(gradle).toContain(`versionCode ${config.android?.versionCode}`);
  });

  it('o projeto raiz do Android é o do Expo (não uma cópia do app/build.gradle)', () => {
    const top = fs.readFileSync(path.join(root, 'android', 'build.gradle'), 'utf8');
    expect(top).toContain('apply plugin: "expo-root-project"');
    expect(top).not.toContain('apply plugin: "com.android.application"');
  });

  it('pede a permissão de notificações (Android 13+) para os alertas', () => {
    expect(config.android?.permissions).toContain('POST_NOTIFICATIONS');
    expect(fs.readFileSync(path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8')).toContain('android.permission.POST_NOTIFICATIONS');
  });
});
