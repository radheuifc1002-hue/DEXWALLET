import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { validateMnemonic, stagePendingMnemonic, stagePendingWalletConfig, stagePendingPrivateKey } from '../mobile/services/walletService';
import type { Blockchain } from '../context/WalletContext';

export default function ImportWallet() {
  const router = useRouter();
  const [mnemonic, setMnemonic] = useState('');
  const [method,setMethod]=useState<'phrase'|'private'>('phrase');
  const [privateKey,setPrivateKey]=useState('');
  const [error, setError] = useState('');
  const [walletName,setWalletName]=useState('Imported Wallet');
  const [hdWallet,setHdWallet]=useState(true);
  const [chain,setChain]=useState<Blockchain>('ethereum');
  const chains:{id:Blockchain;label:string}[]=[{id:'ethereum',label:'Ethereum'},{id:'bnb',label:'BNB'},{id:'polygon',label:'Polygon'},{id:'solana',label:'Solana'}];

  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync();
    setMnemonic(text.trim());
    setError('');
  };

  const handleContinue = () => {
    if(method==='private') { void stagePendingPrivateKey(privateKey,chain,walletName).then(()=>router.push('/set-pin')).catch(()=>setError('Unable to securely prepare private-key import.')); return; }
    const cleaned = mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!validateMnemonic(cleaned)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError('Invalid seed phrase. Check for typos and try again.');
      return;
    }
    void Promise.all([stagePendingMnemonic(cleaned),stagePendingWalletConfig({name:walletName,blockchains:hdWallet?chains.map(item=>item.id):[chain]})]).then(() => router.push('/set-pin')).catch(() => setError('Unable to securely prepare wallet import. Please try again.'));
  };

  const wordCount = mnemonic.trim() ? mnemonic.trim().split(/\s+/).length : 0;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity style={styles.back} onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          <View style={styles.iconWrap}>
            <Ionicons name="download-outline" size={36} color="#6C4CF1" />
          </View>

          <Text style={styles.title}>Import Wallet</Text>
          <TextInput style={styles.walletNameInput} value={walletName} onChangeText={setWalletName} placeholder="Wallet name" placeholderTextColor="#9B97B2" />
          <View style={styles.chainRow}><TouchableOpacity style={[styles.chainChip,method==='phrase'&&styles.chainChipActive]} onPress={()=>setMethod('phrase')}><Text style={[styles.chainText,method==='phrase'&&styles.chainTextActive]}>Recovery phrase</Text></TouchableOpacity><TouchableOpacity style={[styles.chainChip,method==='private'&&styles.chainChipActive]} onPress={()=>{setMethod('private');setHdWallet(false);}}><Text style={[styles.chainText,method==='private'&&styles.chainTextActive]}>Private key</Text></TouchableOpacity></View>
          {method==='phrase'?<><Text style={styles.chainHeading}>Blockchain access</Text>
          <View style={styles.chainRow}><TouchableOpacity style={[styles.chainChip,hdWallet&&styles.chainChipActive]} onPress={()=>setHdWallet(true)}><Text style={[styles.chainText,hdWallet&&styles.chainTextActive]}>HD Wallet · All 4</Text></TouchableOpacity><TouchableOpacity style={[styles.chainChip,!hdWallet&&styles.chainChipActive]} onPress={()=>setHdWallet(false)}><Text style={[styles.chainText,!hdWallet&&styles.chainTextActive]}>Single chain</Text></TouchableOpacity></View>
          {!hdWallet?<View style={styles.chainRow}>{chains.map(item=><TouchableOpacity key={item.id} style={[styles.chainChip,chain===item.id&&styles.chainChipActive]} onPress={()=>setChain(item.id)}><Text style={[styles.chainText,chain===item.id&&styles.chainTextActive]}>{item.label}</Text></TouchableOpacity>)}</View>:null}</>:<><Text style={styles.chainHeading}>Private-key blockchain</Text><View style={styles.chainRow}>{chains.map(item=><TouchableOpacity key={item.id} style={[styles.chainChip,chain===item.id&&styles.chainChipActive]} onPress={()=>setChain(item.id)}><Text style={[styles.chainText,chain===item.id&&styles.chainTextActive]}>{item.label}</Text></TouchableOpacity>)}</View><TextInput style={styles.input} value={privateKey} onChangeText={setPrivateKey} placeholder="Enter private key" placeholderTextColor="#9B97B2" autoCapitalize="none" autoCorrect={false} secureTextEntry/></>}
          <Text style={styles.subtitle}>{method==='phrase'?'Enter your 12- or 24-word recovery phrase separated by spaces.':'Import one chain-specific private key. EVM keys work across Ethereum, BNB and Polygon; Solana keys are separate.'}</Text>

          {method==='phrase'?<>
          <View style={[styles.inputCard, error ? styles.inputCardError : null]}>
            <TextInput
              style={styles.input}
              value={mnemonic}
              onChangeText={(t) => {
                setMnemonic(t);
                setError('');
              }}
              placeholder="word1 word2 word3 …"
              placeholderTextColor="#4A4760"
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              returnKeyType="done"
            />
          </View>

          <View style={styles.meta}>
            <Text style={styles.metaText}>{wordCount} words · 12 or 24 required</Text>
            <TouchableOpacity onPress={handlePaste} style={styles.pasteBtn}>
              <Ionicons name="clipboard-outline" size={16} color="#6C4CF1" />
              <Text style={styles.pasteBtnText}>Paste</Text>
            </TouchableOpacity>
          </View>
          </>:null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.warning}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#6C4CF1" />
            <Text style={styles.warningText}>
              Your recovery phrase or private key stays in secure device storage and is not sent to a server.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.continueBtn, (method==='phrase'?![12,24].includes(wordCount):!privateKey.trim()) && styles.continueBtnDisabled]}
            onPress={handleContinue}
            disabled={method==='phrase'?!([12, 24].includes(wordCount)):!privateKey.trim()}
            activeOpacity={0.85}
          >
            <Text style={styles.continueBtnText}>Continue</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  walletNameInput:{borderWidth:1,borderColor:'#E8E4F3',borderRadius:12,padding:12,color:'#211B35',marginBottom:12},chainHeading:{fontSize:13,fontWeight:'700',color:'#211B35',marginBottom:8},chainRow:{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:12},chainChip:{borderWidth:1,borderColor:'#E8E4F3',borderRadius:10,paddingHorizontal:11,paddingVertical:8},chainChipActive:{backgroundColor:'#6C4CF1',borderColor:'#6C4CF1'},chainText:{fontSize:12,color:'#777286',fontWeight:'600'},chainTextActive:{color:'#FFFFFF'},
  scroll: { padding: 24, paddingBottom: 40 },
  back: { marginBottom: 20 },
  backText: { color: '#6C4CF1', fontSize: 16 },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#211B35',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#777286',
    lineHeight: 20,
    marginBottom: 24,
  },
  inputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8E4F3',
    padding: 4,
    minHeight: 120,
  },
  inputCardError: {
    borderColor: '#EF4444',
  },
  input: {
    color: '#211B35',
    fontSize: 16,
    padding: 12,
    lineHeight: 24,
    minHeight: 112,
    textAlignVertical: 'top',
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  metaText: { color: '#777286', fontSize: 13 },
  pasteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pasteBtnText: { color: '#6C4CF1', fontSize: 14, fontWeight: '600' },
  error: {
    color: '#EF4444',
    fontSize: 13,
    marginBottom: 12,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#6C4CF144',
  },
  warningText: {
    color: '#777286',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  continueBtn: {
    backgroundColor: '#6C4CF1',
    borderRadius: 16,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueBtnDisabled: { opacity: 0.4 },
  continueBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
