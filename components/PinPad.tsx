import { View, Text, StyleSheet, TouchableOpacity, Vibration } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface PinPadProps {
  value: string;
  onChange: (val: string) => void;
  maxLength?: number;
  label?: string;
  errorMsg?: string;
}

const KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', 'del'],
];

export default function PinPad({
  value,
  onChange,
  maxLength = 6,
  label,
  errorMsg,
}: PinPadProps) {
  const handlePress = (key: string) => {
    if (key === 'del') {
      onChange(value.slice(0, -1));
    } else if (key === '') {
      return;
    } else if (value.length < maxLength) {
      onChange(value + key);
    } else {
      Vibration.vibrate(100);
    }
  };

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <View style={styles.dots}>
        {Array.from({ length: maxLength }).map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i < value.length && styles.dotFilled]}
          />
        ))}
      </View>

      {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}

      <View style={styles.pad}>
        {KEYS.map((row, r) => (
          <View key={r} style={styles.row}>
            {row.map((key, c) => (
              <TouchableOpacity
                key={c}
                style={[styles.key, key === '' && styles.keyEmpty]}
                onPress={() => handlePress(key)}
                activeOpacity={key === '' ? 1 : 0.7}
                disabled={key === ''}
              >
                {key === 'del' ? (
                  <Ionicons name="backspace-outline" size={24} color="#FFFFFF" />
                ) : (
                  <Text style={styles.keyText}>{key}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
  },
  label: {
    color: '#9B97B2',
    fontSize: 15,
    marginBottom: 20,
    textAlign: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 12,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#6C4CF1',
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: '#6C4CF1',
  },
  error: {
    color: '#EF4444',
    fontSize: 13,
    marginBottom: 8,
    textAlign: 'center',
  },
  pad: {
    width: '100%',
    maxWidth: 320,
    marginTop: 20,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  key: {
    width: 90,
    height: 70,
    borderRadius: 16,
    backgroundColor: '#1A1825',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyEmpty: {
    backgroundColor: 'transparent',
  },
  keyText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '600',
  },
});
