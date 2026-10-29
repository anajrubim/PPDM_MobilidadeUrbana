import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { TransitMap } from '../components/map';
import { Button, Card, Divider, ErrorNote, Row, Screen, SuccessNote, T } from '../components/ui';
import { errorText } from '../lib/api';
import { ask } from '../lib/dialog';
import { downloadForOffline, forgetOfflineDownload, offlineSavedAt, type DownloadProgress } from '../lib/offline';
import { useOnline } from '../lib/network';
import { clearPersistedCache, queryClient } from '../lib/query';
import { theme } from '../lib/theme';

/** US27 — dados para usar sem internet; US28 — cache das imagens do mapa. */
export default function Offline() {
  const online = useOnline();
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [tiles, setTiles] = useState<{ cached: number; network: number } | null>(null);
  const [clearTiles, setClearTiles] = useState(0);

  useEffect(() => {
    void offlineSavedAt().then(setSavedAt);
  }, []);

  const download = async () => {
    setError(null);
    setDone(null);
    try {
      const r = await downloadForOffline(setProgress);
      setDone(`${r.lines} linhas e ${r.stops} pontos com horários salvos no aparelho.`);
      setSavedAt(await offlineSavedAt());
    } catch (e) {
      setError(errorText(e));
    } finally {
      setProgress(null);
    }
  };

  const clear = () =>
    ask('Apagar os dados salvos?', 'Linhas, horários e o mapa salvos no aparelho serão apagados. Sua conta continua conectada.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: async () => {
          await clearPersistedCache();
          await forgetOfflineDownload();
          setClearTiles((n) => n + 1);
          setSavedAt(null);
          setDone('Dados offline apagados.');
          void queryClient.invalidateQueries();
        },
      },
    ]);

  return (
    <Screen title="Usar sem internet" subtitle="Dados salvos e economia de dados móveis">
      <Card style={{ paddingVertical: 4 }}>
        <Row icon={online ? 'check' : 'wifioff'} title={online ? 'Conectado' : 'Sem conexão'} subtitle={online ? 'Os dados são atualizados automaticamente' : 'Mostrando o que está salvo no aparelho'} tint={online ? theme.colors.green : theme.colors.amberDeep} />
        <Divider />
        <Row
          icon="clock"
          title="Linhas e horários salvos"
          subtitle={savedAt ? `Baixados em ${new Date(savedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : 'Só o que você já abriu'}
        />
      </Card>
      <T v="small" style={{ marginTop: 12, marginBottom: 12 }}>
        Baixe a rede inteira (linhas, trajetos, pontos e horários) para consultar tudo sem internet. Sem conexão, os próximos horários são calculados no
        aparelho pela programação.
      </T>
      {error && <ErrorNote message={error} />}
      {done && <SuccessNote message={done} />}
      <Button
        title={progress ? `Baixando… ${progress.done}/${progress.total}` : savedAt ? 'Atualizar dados offline' : 'Baixar linhas e horários'}
        icon="upload"
        onPress={() => void download()}
        loading={!!progress}
        disabled={!online}
      />

      <T v="label" style={{ marginTop: 22, marginBottom: 8 }}>
        Mapa salvo no aparelho
      </T>
      <TransitMap height={170} onTileStats={setTiles} clearTilesKey={clearTiles} />
      <View style={{ marginTop: 8 }}>
        <T v="small">
          As imagens do mapa ficam guardadas conforme você navega: ao voltar à mesma região elas abrem do aparelho, sem gastar dados.
          {tiles ? ` Nesta tela: ${tiles.cached} do aparelho, ${tiles.network} baixadas.` : ''}
        </T>
      </View>
      <Button title="Apagar dados salvos" icon="trash" variant="ghost" onPress={clear} style={{ marginTop: 16 }} />
    </Screen>
  );
}
