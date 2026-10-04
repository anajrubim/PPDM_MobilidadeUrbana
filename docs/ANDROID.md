# App Android nativo (Android Studio)

O app da Sprint 1 é React Native com Expo. Além do navegador e do Expo Go, ele tem o **projeto Android nativo
versionado em `mobile/android/`**, que abre direto no Android Studio e gera um APK instalável.

## Pré-requisitos

| | Windows | Linux |
|---|---|---|
| Android Studio | [developer.android.com/studio](https://developer.android.com/studio) — instale com o SDK padrão | idem (`.tar.gz` ou `sudo snap install android-studio --classic`) |
| Emulador | Android Studio → **Device Manager** → *Create Virtual Device* (ex.: Pixel 7, Android 14, imagem x86_64) | idem (precisa de KVM: `sudo apt install qemu-kvm` e seu usuário no grupo `kvm`) |
| JDK 17 | o Gradle usa um JDK 17 instalado ou baixa sozinho na primeira vez (ver *Detalhes técnicos*) | idem |
| Node.js 22 + Docker | os mesmos do README | os mesmos do README |

O Android SDK é procurado em `ANDROID_HOME`, depois em `%LOCALAPPDATA%\Android\Sdk` (Windows) ou `~/Android/Sdk` (Linux).
React Native 0.86 exige **Android 7.0 (API 24)** ou mais novo.

## Jeito 1 — pelo botão Run ▶ do Android Studio (debug)

1. **Windows:** dois cliques em `ANDROID-STUDIO-WINDOWS.bat`.
   **Linux / manual:** `npm run setup && npm run db:up && npm run seed && npm run dev:android`.
   Isso sobe o banco, a API (porta 3333) e o **Metro** (porta 8081), que entrega o JavaScript ao app de debug.
2. No Android Studio: **File → Open → `mobile/android`**. Espere o *Gradle sync* (a primeira vez baixa o Gradle e as
   dependências — alguns minutos).
3. Escolha o emulador na barra de cima e clique em **Run ▶**. O app abre no emulador.

Mudou o código TypeScript? Salve: o app recarrega sozinho (Fast Refresh). Só precisa de Run de novo quando mexer em
`android/` ou instalar uma biblioteca nativa.

## Jeito 2 — APK de release (sem Metro)

**Windows:** dois cliques em `ANDROID-WINDOWS.bat` · **Linux:** `./android-linux.sh` · ou `npm run android`.

Faz tudo em sequência: sobe banco + API (se ainda não estiverem no ar), compila o APK com o JavaScript embutido
(5 a 20 min na primeira vez, ~1 min depois), liga o primeiro emulador do Device Manager, instala, dá a permissão de
localização, coloca o GPS do emulador no centro da rede de demonstração e abre o app. Registro em `android.log`.

O APK fica em **`apk/mobilidade-urbana-sprint01.apk`** — dá para arrastar para qualquer emulador.

| Comando | O que faz |
|---|---|
| `npm run android` | tudo (acima) · `-- --sem-build` reaproveita o APK já compilado |
| `npm run android:apk` | só compila (`-- --lan` para celular na mesma Wi-Fi; `-- --api-url=https://...` para um servidor) |
| `npm run android:emulador` | liga o primeiro emulador (`-- --avd=Nome` para escolher) |
| `npm run android:instalar` | instala o APK no emulador/celular conectado e abre |
| `npm run dev:android` | API + Metro para o build de debug do Android Studio |

## Como o app acha a API

| Situação | Endereço usado |
|---|---|
| Emulador (debug ou APK) | `http://10.0.2.2:3333` — o `10.0.2.2` é o "localhost" do PC visto de dentro do emulador |
| Debug num celular pelo cabo USB | `http://localhost:3333` + `adb reverse` (o `npm run dev:android` já faz) |
| APK num celular na Wi-Fi | `npm run android:apk -- --lan` grava o IP do PC no APK (libere a porta 3333 no firewall) |
| Qualquer outro | `EXPO_PUBLIC_API_URL=https://servidor/...` antes de compilar |

Em desenvolvimento o app aceita HTTP (`usesCleartextTraffic`) para falar com a API local; com `APP_ENV=production`
o APK só aceita HTTPS (US13).

## Detalhes técnicos

- `mobile/android/` foi gerado por `npx expo prebuild -p android` a partir do `app.config.ts` e está **versionado**:
  o Android Studio abre sem rodar nenhum comando do Expo. Para regenerar: `cd mobile && npx expo prebuild -p android --clean`.
- Plugins de configuração (`mobile/plugins/`):
  - `with-short-native-path.js` — no Windows, o build C++ das bibliotecas (CMake/ninja) estoura o limite de 260
    caracteres de caminho; o plugin move os intermediários (`.cxx`) do app e das bibliotecas para `%USERPROFILE%\.mu-cxx`. Com `-- --subst`, o `npm run android:apk`
    compila por uma unidade virtual curta (`subst`), desfeita no final — só para pastas muito fundas.
  - `with-gradle-daemon-jdk.js` — grava `android/gradle/gradle-daemon-jvm.properties`, que faz o Gradle usar
    **Java 17** (o recomendado pelo React Native) em qualquer lugar: usa um JDK 17 instalado ou baixa o Eclipse
    Temurin 17 sozinho na primeira vez. Sem isso, o Java 25 que vem no Android Studio faz o Prefab imprimir um aviso
    que o Android Gradle Plugin trata como erro (`configureCMakeDebug` falha no Gradle sync).
  - `with-release-signing.js` — o release usa a keystore de debug, a menos que existam as propriedades do Gradle
    `MU_STORE_FILE`, `MU_STORE_PASSWORD`, `MU_KEY_ALIAS` e `MU_KEY_PASSWORD` (em `~/.gradle/gradle.properties`,
    nunca no repositório). Para publicar na Play Store, gere uma keystore com `keytool` e preencha essas propriedades.
- O mapa é o mesmo Leaflet da web, dentro de uma `WebView` (`react-native-webview`): nenhuma chave de API.
- APK padrão com as arquiteturas `x86_64` (emulador) e `arm64-v8a` (celulares); `-- --abis=...` muda.

## Problemas comuns

| Sintoma | Solução |
|---|---|
| `Android SDK não encontrado` | abra o Android Studio uma vez (ele instala o SDK) ou defina `ANDROID_HOME` |
| `Nenhum emulador criado` | Device Manager → Create Virtual Device |
| App abre mas mostra "Sem conexão com o servidor" | a API não está rodando (`npm run dev:api`) ou, no celular, o firewall bloqueia a porta 3333 |
| Debug mostra tela vermelha "Unable to load script" | o Metro não está rodando: `npm run dev:android` |
| Windows: erro com `260` / `ninja: build.ninja still dirty` | mova o projeto para uma pasta de caminho mais curto (ex.: `C:\dev\sprint01`) |
| Gradle sync falha com `A restricted method in java.lang.System has been called` | o Gradle está com Java 25: confira se `mobile/android/gradle/gradle-daemon-jvm.properties` existe (pede Java 17) e faça o sync de novo |
| Primeiro sync demora muito | normal: baixa o Gradle, o JDK 17 (se não houver) e as dependências — 5 a 15 min |
| Gradle sync falha com `node` não encontrado | o Android Studio precisa achar o Node.js: feche e abra de novo depois de instalar o Node |
