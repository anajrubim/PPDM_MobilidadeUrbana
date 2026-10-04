const { withAppBuildGradle, withProjectBuildGradle } = require('expo/config-plugins');

/**
 * Windows: o caminho dos objetos do build nativo (`.cxx/.../CMakeFiles/<alvo>.dir/C_/Users/.../node_modules/...`)
 * estoura o limite de 260 caracteres e o CMake/ninja falha com "Filename longer than 260 characters" ou
 * "manifest 'build.ninja' still dirty after 100 tries".
 *
 * Este plugin move o diretório intermediário do CMake (`.cxx`) do app e de todas as bibliotecas para
 * `%USERPROFILE%\.mu-cxx\<módulo>` (no Linux/macOS, o diretório temporário). Com a pasta base curta, o CMake
 * consegue encurtar os nomes dos objetos e o build cabe no limite, inclusive pelo botão Run do Android Studio.
 * Não altera o APK gerado — só onde ficam os objetos intermediários.
 */
const BASE = "new File(System.getenv('USERPROFILE') ?: System.getProperty('java.io.tmpdir'), '.mu-cxx')";

// Bibliotecas (subprojetos que aplicam o plugin Android depois do projeto raiz)
const ROOT_BLOCK = `
// Windows: caminhos longos quebram o CMake/ninja das bibliotecas nativas (MAX_PATH).
// Move o diretório de build nativo (.cxx) para um caminho curto fora do projeto.
def muNativeBase = ${BASE}
subprojects { sub ->
    ['com.android.library', 'com.android.application'].each { pluginId ->
        sub.plugins.withId(pluginId) {
            try {
                sub.android.externalNativeBuild.cmake.buildStagingDirectory = new File(muNativeBase, sub.name)
            } catch (Exception ignored) { }
        }
    }
}
`;

// O :app é avaliado antes do bloco acima (evaluationDependsOn do React Native), então precisa ser no próprio build.gradle
const APP_BLOCK = `
    // Windows: diretório curto para o build nativo (.cxx) — ver plugins/with-short-native-path.js
    externalNativeBuild {
        cmake {
            buildStagingDirectory = new File(${BASE}, 'app')
        }
    }
`;

function withRoot(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.contents.includes('.mu-cxx')) return cfg;
    cfg.modResults.contents = `${cfg.modResults.contents.trimEnd()}\n${ROOT_BLOCK}`;
    return cfg;
  });
}

function withApp(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.contents.includes('.mu-cxx')) return cfg;
    cfg.modResults.contents = cfg.modResults.contents.replace(/\nandroid \{\n/, (m) => `${m}${APP_BLOCK}`);
    return cfg;
  });
}

module.exports = function withShortNativePath(config) {
  return withApp(withRoot(config));
};
