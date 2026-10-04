import { dayLabel, etaLabel, greeting, initials, minutesLabel } from '../format';
import { distanceM, formatDistance, framingPoints, toLatLng } from '../geo';
import { cleanName, nameError, passwordError, utf8Bytes, validateRegistration } from '../validation';

describe('US01 — validação do cadastro na tela', () => {
  it('aceita dados válidos', () => {
    expect(validateRegistration({ name: 'Ana', email: 'ana@email.com', password: 'Senha123' })).toEqual({});
  });
  it('aponta cada campo inválido', () => {
    expect(validateRegistration({ name: ' ', email: 'x', password: '123' })).toEqual({
      name: 'Informe seu nome',
      email: 'E-mail inválido',
      password: 'Mínimo de 8 caracteres',
    });
    expect(validateRegistration({ name: 'A', email: 'a@b.co', password: 'somenteletras' }).password).toBe('Use letras e números');
    expect(validateRegistration({ name: 'A', email: 'a@b.co', password: '12345678' }).password).toBe('Use letras e números');
  });
});

describe('formatação', () => {
  it('minutos', () => {
    expect(minutesLabel(null)).toBe('—');
    expect(minutesLabel(0)).toBe('agora');
    expect(minutesLabel(12)).toBe('12 min');
    expect(minutesLabel(60)).toBe('1 h');
    expect(minutesLabel(78)).toBe('1 h 18 min');
  });
  it('previsão: minutos até 90, depois o horário', () => {
    const now = new Date(2026, 8, 21, 9, 0);
    expect(etaLabel(undefined, now)).toBe('—');
    expect(etaLabel(0, now)).toBe('agora');
    expect(etaLabel(7, now)).toBe('07 min');
    expect(etaLabel(120, now)).toBe('11:00');
  });
  it('dia da viagem', () => {
    const now = new Date(2026, 8, 21, 20, 0);
    expect(dayLabel(new Date(2026, 8, 21, 8, 2).toISOString(), now)).toBe('HOJE · 08:02');
    expect(dayLabel(new Date(2026, 8, 20, 18, 24).toISOString(), now)).toBe('ONTEM · 18:24');
    expect(dayLabel(new Date(2026, 8, 17, 7, 0).toISOString(), now)).toBe('QUI · 07:00');
    expect(dayLabel(new Date(2026, 7, 1, 7, 0).toISOString(), now)).toBe('01/08 · 07:00');
  });
  it('saudação e iniciais', () => {
    expect(greeting(new Date(2026, 0, 1, 8))).toBe('Bom dia');
    expect(greeting(new Date(2026, 0, 1, 14))).toBe('Boa tarde');
    expect(greeting(new Date(2026, 0, 1, 21))).toBe('Boa noite');
    expect(initials('marina alves')).toBe('M');
  });
});

describe('geografia (US10)', () => {
  const terminal = { latitude: -23.1865, longitude: -45.8845 };
  it('distância e formatação', () => {
    const d = distanceM(terminal, { latitude: -23.1905, longitude: -45.8895 });
    expect(d).toBeGreaterThan(600);
    expect(d).toBeLessThan(700);
    expect(formatDistance(350)).toBe('350 m');
    expect(formatDistance(1234)).toBe('1,2 km');
    expect(formatDistance(15_400)).toBe('15 km');
  });
  it('converte formatos de coordenada', () => {
    expect(toLatLng([-23, -45])).toEqual({ latitude: -23, longitude: -45 });
    expect(toLatLng({ lat: -23, lng: -45 })).toEqual({ latitude: -23, longitude: -45 });
  });
  it('enquadramento ignora o usuário muito longe da rota', () => {
    const route = [terminal, { latitude: -23.2, longitude: -45.9 }];
    expect(framingPoints(route, null)).toEqual(route);
    expect(framingPoints([], terminal)).toEqual([terminal]);
    expect(framingPoints(route, { latitude: -23.19, longitude: -45.89 })).toHaveLength(3);
    expect(framingPoints(route, { latitude: -22.9, longitude: -43.2 })).toHaveLength(2); // Rio de Janeiro
  });
});

describe('entradas maliciosas ou estranhas', () => {
  it('senha acima de 72 bytes (limite do bcrypt) é recusada, contando acentos', () => {
    expect(validateRegistration({ name: 'A', email: 'a@b.co', password: `${'a'.repeat(71)}1` }).password).toBeUndefined();
    expect(validateRegistration({ name: 'A', email: 'a@b.co', password: `${'a'.repeat(72)}1` }).password).toBe('Máximo de 72 caracteres');
    expect(utf8Bytes('é')).toBe(2);
    expect(utf8Bytes('😀')).toBe(4);
    expect(passwordError(`${'é'.repeat(36)}1`)).toBe('Máximo de 72 caracteres');
  });
  it('nome invisível, só números ou longo demais', () => {
    expect(nameError('​​')).toBe('Informe seu nome');
    expect(nameError('12345')).toBe('O nome precisa ter letras');
    expect(nameError('a'.repeat(101))).toBe('Máximo de 100 caracteres');
    expect(cleanName('  Ana​   Maria‮ ')).toBe('Ana Maria');
  });
});
