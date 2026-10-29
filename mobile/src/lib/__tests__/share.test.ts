import { Platform, Share } from 'react-native';
import { openShareSheet, shareMessage } from '../share';
import type { LocationShare } from '../types';

const example = {
  id: 'share-1',
  url: 'https://mobilidade.app/share/abc',
  active: true,
  expiresAt: '2099-01-01T00:00:00Z',
} as LocationShare;

const originalPlatform = Object.getOwnPropertyDescriptor(Platform, 'OS');
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

function setPlatform(os: string) {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    value: os,
  });
}

function setNavigator(value: object) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value,
  });
}

afterEach(() => {
  jest.restoreAllMocks();

  if (originalPlatform) {
    Object.defineProperty(Platform, 'OS', originalPlatform);
  }

  if (originalNavigator) {
    Object.defineProperty(globalThis, 'navigator', originalNavigator);
  } else {
    Reflect.deleteProperty(globalThis, 'navigator');
  }
});

describe('shareMessage', () => {
  it('monta uma mensagem com o primeiro nome e o link', () => {
    expect(shareMessage(example, 'Ana Júlia')).toBe(
      'Ana está compartilhando a localização com você pelo Mobilidade Urbana. Acompanhe: https://mobilidade.app/share/abc',
    );
  });

  it('inclui linha, destino e previsão quando disponíveis', () => {
    const share = {
      ...example,
      route: {
        line: { code: '175' },
        dest: { name: 'Centro' },
        eta: '10:30',
      },
    } as LocationShare;

    const message = shareMessage(share, 'Ana Júlia');

    expect(message).toContain('ônibus 175');
    expect(message).toContain('indo para Centro');
    expect(message).toContain('chegada prevista às 10:30');
  });

  it('inclui a linha sem destino ou previsão', () => {
    const share = {
      ...example,
      route: { line: { code: '321' } },
    } as LocationShare;

    expect(shareMessage(share, 'Ana')).toContain('ônibus 321.');
  });
});

describe('openShareSheet', () => {
  it('compartilha pela API nativa', async () => {
    setPlatform('ios');
    jest.spyOn(Share, 'share').mockResolvedValue({
      action: 'sharedAction',
    } as never);

    await expect(openShareSheet(example, 'Ana')).resolves.toBe('shared');
    expect(Share.share).toHaveBeenCalledWith({
      message: expect.stringContaining(example.url!),
      title: 'Minha localização',
    });
  });

  it('retorna dismissed quando o compartilhamento nativo é cancelado', async () => {
    setPlatform('ios');
    jest.spyOn(Share, 'share').mockResolvedValue({
      action: Share.dismissedAction,
    } as never);

    await expect(openShareSheet(example, 'Ana')).resolves.toBe('dismissed');
  });

  it('compartilha pela web quando navigator.share está disponível', async () => {
    setPlatform('web');
    const share = jest.fn().mockResolvedValue(undefined);
    setNavigator({ share });

    await expect(openShareSheet(example, 'Ana')).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({
      title: 'Minha localização',
      text: expect.stringContaining(example.url!),
      url: example.url,
    });
  });

  it('copia a mensagem quando o compartilhamento web falha', async () => {
    setPlatform('web');
    const share = jest.fn().mockRejectedValue(new Error('cancelado'));
    const writeText = jest.fn().mockResolvedValue(undefined);
    setNavigator({ share, clipboard: { writeText } });

    await expect(openShareSheet(example, 'Ana')).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining(example.url!));
  });

  it('copia a mensagem quando navigator.share não existe', async () => {
    setPlatform('web');
    const writeText = jest.fn().mockResolvedValue(undefined);
    setNavigator({ clipboard: { writeText } });

    await expect(openShareSheet(example, 'Ana')).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalled();
  });
});
