import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cardShadow, theme } from '../lib/theme';
import { Icon, type IconName } from './Icon';

const useTheme = () => theme;

// ---------- Texto ----------
type Variant = 'h1' | 'h2' | 'h3' | 'body' | 'small' | 'label' | 'caption' | 'mono';

export function T({
  children,
  v = 'body',
  color,
  style,
  numberOfLines,
  center,
}: {
  children: ReactNode;
  v?: Variant;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  center?: boolean;
}) {
  const t = useTheme();
  const base: Record<Variant, TextStyle> = {
    h1: { fontFamily: t.font.heavy, fontSize: 24, letterSpacing: -0.3, color: t.colors.text },
    h2: { fontFamily: t.font.heavy, fontSize: 19, color: t.colors.text },
    h3: { fontFamily: t.font.bold, fontSize: 15, color: t.colors.text },
    body: { fontFamily: t.font.medium, fontSize: 14, color: t.colors.text, lineHeight: 20 },
    small: { fontFamily: t.font.medium, fontSize: 12.5, color: t.colors.textSoft, lineHeight: 18 },
    label: { fontFamily: t.font.bold, fontSize: 12, color: t.colors.textSoft },
    caption: { fontFamily: t.font.semibold, fontSize: 11, color: t.colors.textFaint },
    mono: { fontFamily: t.font.mono, fontSize: 12, fontWeight: '600', color: t.colors.text },
  };
  return (
    <Text numberOfLines={numberOfLines} style={[base[v], color ? { color } : null, center ? { textAlign: 'center' } : null, style]}>
      {children}
    </Text>
  );
}

// ---------- Estrutura de tela ----------
export function Screen({
  children,
  title,
  subtitle,
  back = true,
  right,
  scroll = true,
  padded = true,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  back?: boolean;
  right?: ReactNode;
  scroll?: boolean;
  padded?: boolean;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const body = <View style={[padded && { padding: 20 }, { paddingBottom: 40 + insets.bottom }]}>{children}</View>;
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      {title !== undefined && (
        <View
          style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: t.colors.surface, borderBottomColor: t.colors.border }]}
        >
          {back && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Voltar"
              hitSlop={12}
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
              style={styles.backBtn}
            >
              <Icon name="back" size={22} color={t.colors.text} />
            </Pressable>
          )}
          <View style={{ flex: 1 }}>
            <T v="h3" numberOfLines={1} style={{ fontSize: 17 }}>
              {title}
            </T>
            {subtitle ? (
              <T v="small" numberOfLines={1}>
                {subtitle}
              </T>
            ) : null}
          </View>
          {right}
        </View>
      )}
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled">{body}</ScrollView> : <View style={{ flex: 1 }}>{children}</View>}
    </View>
  );
}

/** Cabeçalho azul em gradiente (Início, onboarding, perfil). */
export function Hero({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient
      colors={[t.colors.heroFrom, t.colors.heroTo]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.6, y: 1 }}
      style={[{ paddingTop: insets.top + 10, paddingHorizontal: 22, paddingBottom: 22, overflow: 'hidden' }, style]}
    >
      <View style={[styles.deco, { top: -60, right: -40 }]} />
      <View style={[styles.deco, { width: 120, height: 120, bottom: -50, left: -30 }]} />
      {children}
    </LinearGradient>
  );
}

export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const s = [styles.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border }, cardShadow, style];
  if (!onPress) return <View style={s}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [s, pressed && { opacity: 0.75 }]}
    >
      {children}
    </Pressable>
  );
}

export function SectionTitle({ children, action, onAction }: { children: ReactNode; action?: string; onAction?: () => void }) {
  const t = useTheme();
  return (
    <View style={styles.sectionTitle}>
      <T v="label">{children}</T>
      {action && (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={10}>
          <T v="label" color={t.colors.primary}>
            {action}
          </T>
        </Pressable>
      )}
    </View>
  );
}

// ---------- Controles ----------
export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const bg = {
    primary: t.colors.primary,
    secondary: t.colors.surface,
    ghost: 'transparent',
    danger: t.colors.red,
    success: t.colors.green,
  }[variant];
  const fg = variant === 'secondary' || variant === 'ghost' ? t.colors.primary : '#fff';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: variant === 'secondary' ? t.colors.border : bg },
        (disabled || loading) && { opacity: 0.55 },
        pressed && { opacity: 0.8 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={18} color={fg} /> : null}
      <Text style={{ color: fg, fontFamily: t.font.bold, fontSize: 14.5 }}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, error, icon, ...props }: TextInputProps & { label: string; error?: string | null; icon?: IconName }) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: 14 }}>
      <T v="label" style={{ marginBottom: 6 }}>
        {label}
      </T>
      <View style={[styles.input, { backgroundColor: t.colors.surface, borderColor: error ? t.colors.red : t.colors.border }]}>
        {icon && <Icon name={icon} size={18} color={t.colors.textFaint} />}
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={t.colors.textFaint}
          style={{ flex: 1, fontFamily: t.font.medium, fontSize: 14.5, color: t.colors.text, paddingVertical: 12 }}
          {...props}
        />
      </View>
      {error ? (
        <T v="small" color={t.colors.red} style={{ marginTop: 4 }}>
          {error}
        </T>
      ) : null}
    </View>
  );
}

export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress?: () => void; icon?: IconName }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: active ? t.colors.primary : t.colors.chipBg, borderColor: active ? t.colors.primary : t.colors.border },
      ]}
    >
      {icon && <Icon name={icon} size={14} color={active ? '#fff' : t.colors.primary} />}
      <Text style={{ fontFamily: t.font.bold, fontSize: 12.5, color: active ? '#fff' : t.colors.primary }}>{label}</Text>
    </Pressable>
  );
}

export function LineBadge({ code, color, size = 'md' }: { code: string; color: string; size?: 'sm' | 'md' | 'lg' }) {
  const t = useTheme();
  const dims = { sm: { h: 24, f: 11.5, px: 7 }, md: { h: 30, f: 13, px: 9 }, lg: { h: 40, f: 16, px: 12 } }[size];
  return (
    <View
      style={{
        backgroundColor: color,
        borderRadius: 9,
        height: dims.h,
        minWidth: dims.h + 12,
        paddingHorizontal: dims.px,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontFamily: t.font.heavy, fontSize: dims.f }}>{code}</Text>
    </View>
  );
}

export function Row({
  icon,
  title,
  subtitle,
  right,
  onPress,
  tint,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  tint?: string;
}) {
  const t = useTheme();
  const content = (
    <View style={styles.row}>
      {icon && (
        <View style={[styles.rowIcon, { backgroundColor: t.colors.tint }]}>
          <Icon name={icon} size={18} color={tint ?? t.colors.primary} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <T v="h3" style={{ fontSize: 14 }}>
          {title}
        </T>
        {subtitle ? <T v="small">{subtitle}</T> : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron" size={18} color={t.colors.textFaint} /> : null)}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.6 }}>
      {content}
    </Pressable>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.colors.border, marginVertical: 2 }} />;
}

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  const t = useTheme();
  return (
    <View style={{ padding: 40, alignItems: 'center', gap: 10 }}>
      <ActivityIndicator color={t.colors.primary} />
      <T v="small">{label}</T>
    </View>
  );
}

export function Empty({
  icon = 'search',
  title,
  text,
  action,
  onAction,
}: {
  icon?: IconName;
  title: string;
  text?: string;
  action?: string;
  onAction?: () => void;
}) {
  const t = useTheme();
  return (
    <View style={{ padding: 32, alignItems: 'center', gap: 8 }}>
      <View style={[styles.rowIcon, { width: 52, height: 52, borderRadius: 16, backgroundColor: t.colors.tint }]}>
        <Icon name={icon} size={24} color={t.colors.primary} />
      </View>
      <T v="h3" center>
        {title}
      </T>
      {text ? (
        <T v="small" center>
          {text}
        </T>
      ) : null}
      {action ? <Button title={action} variant="secondary" onPress={onAction} style={{ marginTop: 8 }} /> : null}
    </View>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useTheme();
  return (
    <View accessibilityRole="alert" style={[styles.note, { backgroundColor: t.colors.redTint }]}>
      <T v="small" color={t.colors.redDeep} style={{ flex: 1, fontFamily: t.font.semibold }}>
        {message}
      </T>
      {onRetry && (
        <Pressable onPress={onRetry} accessibilityRole="button" hitSlop={8}>
          <T v="label" color={t.colors.redDeep}>
            Tentar de novo
          </T>
        </Pressable>
      )}
    </View>
  );
}

export function SuccessNote({ message }: { message: string }) {
  const t = useTheme();
  return (
    <View accessibilityRole="alert" style={[styles.note, { backgroundColor: t.colors.greenTint }]}>
      <Icon name="check" size={16} color={t.colors.green} />
      <T v="small" color={t.colors.greenDeep} style={{ flex: 1, fontFamily: t.font.bold }}>
        {message}
      </T>
    </View>
  );
}

export function Pill({ label, tone = 'blue' }: { label: string; tone?: 'blue' | 'green' | 'amber' | 'red' | 'purple' }) {
  const t = useTheme();
  const map = {
    blue: [t.colors.tint, t.colors.primary],
    green: [t.colors.greenTint, t.colors.green],
    amber: [t.colors.amberTint, t.colors.amberDeep],
    red: [t.colors.redTint, t.colors.redDeep],
    purple: [t.colors.purpleTint, t.colors.purple],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Text style={{ color: fg, fontFamily: t.font.bold, fontSize: 11 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  backBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', marginLeft: -6 },
  deco: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.06)' },
  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  sectionTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, marginTop: 16 },
  button: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: 18,
    minHeight: 48,
  },
  input: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  chip: { flexDirection: 'row', gap: 6, alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, minHeight: 48 },
  rowIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  note: { flexDirection: 'row', gap: 8, alignItems: 'center', borderRadius: 12, padding: 12, marginBottom: 12 },
});
