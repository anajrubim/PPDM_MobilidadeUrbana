/** Tokens do UI kit (Mobilidade_Urbana_Todas_as_Telas.html). Tema escuro fica para a Sprint 3 (US39). */
export const palette = {
  blue: '#1B4F72',
  blueDeep: '#0F3450',
  blueSoft: '#2E6E96',
  blueTint: '#E7EEF3',
  green: '#219653',
  greenDeep: '#186B3C',
  greenTint: '#E5F5EC',
  amber: '#F2994A',
  amberDeep: '#C87124',
  amberTint: '#FDEEE0',
  red: '#E74C3C',
  redDeep: '#B93A2C',
  redTint: '#FBE7E4',
  purple: '#7C5CBF',
  purpleTint: '#F1EDFA',
  gold: '#C9971C',
  goldTint: '#FBF1DD',
};

export interface Theme {
  dark: boolean;
  colors: {
    bg: string;
    surface: string;
    elevated: string;
    border: string;
    text: string;
    textSoft: string;
    textFaint: string;
    primary: string;
    primaryText: string;
    chipBg: string;
    heroFrom: string;
    heroTo: string;
    tint: string;
  } & typeof palette;
  radius: { sm: number; md: number; lg: number };
  font: { regular: string; medium: string; semibold: string; bold: string; heavy: string; mono: string };
}

const font = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  heavy: 'Manrope_800ExtraBold',
  mono: 'monospace',
};
const radius = { sm: 10, md: 14, lg: 20 };

export const theme: Theme = {
  dark: false,
  colors: {
    ...palette,
    bg: '#F5F7FA',
    surface: '#FFFFFF',
    elevated: '#FFFFFF',
    border: '#E4E9EE',
    text: '#1C2833',
    textSoft: '#566573',
    textFaint: '#93A0AC',
    primary: palette.blue,
    primaryText: '#FFFFFF',
    chipBg: '#FFFFFF',
    heroFrom: palette.blue,
    heroTo: palette.blueDeep,
    tint: palette.blueTint,
  },
  radius,
  font,
};

/** Sombra do cartão (boxShadow funciona igual no Android, iOS e navegador). */
export const cardShadow = { boxShadow: '0px 4px 10px rgba(28, 40, 51, 0.08)', elevation: 2 } as const;
