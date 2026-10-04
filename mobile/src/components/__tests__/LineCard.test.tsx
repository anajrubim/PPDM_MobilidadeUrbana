import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { LineCard } from '../LineCard';
import type { LineSummary } from '../../lib/types';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const line: LineSummary = {
  id: 7,
  code: 'E50',
  name: 'Executivo Terminal → Aeroporto',
  origin: 'Terminal',
  destination: 'Aeroporto',
  mode: 'bus',
  serviceType: 'executivo',
  status: 'active',
  color: '#186B3C',
  headwayMin: 45,
  firstDeparture: '05:30',
  lastDeparture: '21:30',
  stopsCount: 4,
  operating: true,
  isFavorite: false,
};

describe('LineCard (US05/US11)', () => {
  it('mostra os dados da linha e abre o detalhe', async () => {
    await render(<LineCard line={line} />);
    expect(screen.getByText('E50')).toBeTruthy();
    expect(screen.getByText('Executivo Terminal → Aeroporto')).toBeTruthy();
    expect(screen.getByText('4 paradas · a cada 45 min · 05:30–21:30')).toBeTruthy();
    expect(screen.getByText('Executivo')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Linha E50, Executivo Terminal → Aeroporto'));
    expect(router.push).toHaveBeenCalledWith('/lines/7');
  });

  it('estrela favorita/desfavorita', async () => {
    const onToggle = jest.fn();
    const { rerender } = await render(<LineCard line={line} onToggleFavorite={onToggle} />);
    await fireEvent.press(screen.getByLabelText('Favoritar E50'));
    expect(onToggle).toHaveBeenCalledWith(line);
    await rerender(<LineCard line={{ ...line, isFavorite: true }} onToggleFavorite={onToggle} />);
    expect(screen.getByLabelText('Remover E50 dos favoritos')).toBeTruthy();
  });

  it('avisa quando a linha está fora de operação', async () => {
    const r = await render(<LineCard line={{ ...line, operating: false, serviceType: 'normal' }} />);
    expect(r.getByText('Fora de operação')).toBeTruthy();
  });
});
