import { router } from 'expo-router';
import { Button, Empty, Screen } from '../components/ui';

export default function NotFound() {
  return (
    <Screen title="Página não encontrada">
      <Empty icon="map" title="Essa página não existe" text="O endereço pode ter mudado." />
      <Button title="Ir para o início" onPress={() => router.replace('/')} />
    </Screen>
  );
}
