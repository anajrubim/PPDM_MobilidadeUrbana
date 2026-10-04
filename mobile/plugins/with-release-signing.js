const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Assinatura de release própria, sem tocar em `android/` na mão.
 *
 * O template do Expo assina o release com a keystore de debug. Este plugin troca por uma
 * configuração que lê as credenciais das propriedades do Gradle (arquivo `~/.gradle/gradle.properties`,
 * variáveis `ORG_GRADLE_PROJECT_*` ou `-P` na linha de comando):
 *
 *   MU_STORE_FILE, MU_STORE_PASSWORD, MU_KEY_ALIAS, MU_KEY_PASSWORD
 *
 * Sem essas propriedades o build de release continua funcionando com a keystore de debug —
 * serve para gerar um APK de teste, mas não para publicar na Play Store.
 */
const RELEASE_SIGNING = `
        release {
            // Credenciais vêm das propriedades do Gradle; nunca do repositório (ver docs/ANDROID.md)
            if (project.hasProperty('MU_STORE_FILE')) {
                storeFile file(project.property('MU_STORE_FILE'))
                storePassword project.property('MU_STORE_PASSWORD')
                keyAlias project.property('MU_KEY_ALIAS')
                keyPassword project.property('MU_KEY_PASSWORD')
            }
        }
`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (gradle.includes("project.hasProperty('MU_STORE_FILE')")) return cfg;

    // 1. Declara o signingConfig de release ao lado do de debug
    gradle = gradle.replace(
      /(signingConfigs \{\n(?:.*\n)*?\s*debug \{\n(?:.*\n)*?\s*\}\n)/,
      (match) => `${match}${RELEASE_SIGNING}`,
    );

    // 2. O build de release passa a usá-lo quando as credenciais existem
    gradle = gradle.replace(
      /(release \{\n\s*\/\/ Caution![^\n]*\n\s*\/\/ see[^\n]*\n\s*)signingConfig signingConfigs\.debug/,
      `$1signingConfig project.hasProperty('MU_STORE_FILE') ? signingConfigs.release : signingConfigs.debug`,
    );

    cfg.modResults.contents = gradle;
    return cfg;
  });
};
