const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

/**
 * Fixa o Java do Gradle em 17 (o recomendado pelo React Native), no Android Studio e na linha de comando.
 *
 * O Android Studio recente vem com Java 25 (`jbr`). Com ele, o Prefab imprime
 * "WARNING: A restricted method in java.lang.System has been called" e o Android Gradle Plugin trata o aviso
 * como erro: o Gradle sync falha em `:react-native-worklets:configureCMakeDebug`.
 *
 * O arquivo `android/gradle/gradle-daemon-jvm.properties` (critério de JVM do daemon, Gradle 8.8+) faz o Gradle
 * usar um JDK 17 já instalado ou baixá-lo sozinho (Eclipse Temurin) na primeira vez.
 */
const URL = (os, arch) => `https\\://api.adoptium.net/v3/binary/latest/17/ga/${os}/${arch}/jdk/hotspot/normal/eclipse`;
const PLATFORMS = [
  ['FREE_BSD', 'linux'],
  ['LINUX', 'linux'],
  ['MAC_OS', 'mac'],
  ['UNIX', 'linux'],
  ['WINDOWS', 'windows'],
];
const CONTENT = [
  '# Java do Gradle: 17 (ver plugins/with-gradle-daemon-jdk.js)',
  ...PLATFORMS.flatMap(([key, os]) => [
    `toolchainUrl.${key}.AARCH64=${URL(os, 'aarch64')}`,
    `toolchainUrl.${key}.X86_64=${URL(os, 'x64')}`,
  ]),
  'toolchainVersion=17',
  '',
].join('\n');

module.exports = function withGradleDaemonJdk(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const file = path.join(cfg.modRequest.platformProjectRoot, 'gradle', 'gradle-daemon-jvm.properties');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, CONTENT);
      return cfg;
    },
  ]);
};
