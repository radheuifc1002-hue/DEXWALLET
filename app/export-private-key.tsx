import { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import WalletAuthorizationModal from '../components/WalletAuthorizationModal';
import type { WalletAuthorization } from '../mobile/services/walletSecurityService';
import { useWallet } from '../context/WalletContext';
import { getPrivateKeyForSource } from '../mobile/services/walletVaultService';

export default function ExportPrivateKey() {
  const router = useRouter();
  const { activeWallet } = useWallet();
  const [authorizationVisible,setAuthorizationVisible] = useState(true);
  const [key,setKey] = useState('');
  const [error,setError] = useState('');
  const [hidden,setHidden] = useState(true);
  const [copied,setCopied] = useState(false);
  const handleAuthorized = async (authorization: WalletAuthorization) => {
    try {
      if(!activeWallet?.sourceId||activeWallet.sourceType!=='private-key') throw new Error('The selected account is not a private-key wallet.');
      const secret=await getPrivateKeyForSource(activeWallet.sourceId,authorization);
      if(!secret) throw new Error('Private key unavailable.');
      setKey(secret);setError('');setAuthorizationVisible(false);Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch(e) { setError(e instanceof Error?e.message:'Unable to export private key.'); }
  };
  const copy=async()=>{await Clipboard.setStringAsync(key);setCopied(true);setTimeout(()=>setCopied(false),1800);};
  return <SafeAreaView style={styles.container}>
    <View style={styles.header}><TouchableOpacity onPress={()=>router.back()}><Text style={styles.back}>← Back</Text></TouchableOpacity><Text style={styles.headerTitle}>Export Private Key</Text><View style={{width:50}}/></View>
    {!key?<View style={styles.center}><Ionicons name="lock-closed" size={38} color="#6C4CF1"/><Text style={styles.title}>Verify your identity</Text><Text style={styles.subtitle}>Enter your six-digit PIN to reveal this account's private key.</Text>{error?<Text style={styles.warningText}>{error}</Text>:null}</View>:<ScrollView contentContainerStyle={styles.body}>
      <View style={styles.warning}><Ionicons name="warning" size={20} color="#DC6262"/><Text style={styles.warningText}>Anyone with this key can control the wallet and its funds. Never share it or store it in an untrusted location.</Text></View>
      <TouchableOpacity style={styles.reveal} onPress={()=>setHidden(v=>!v)}><Ionicons name={hidden?'eye-outline':'eye-off-outline'} size={19} color="#6C4CF1"/><Text style={styles.revealText}>{hidden?'Tap to reveal private key':'Hide private key'}</Text></TouchableOpacity>
      {!hidden?<Text selectable style={styles.secret}>{key}</Text>:null}
      <TouchableOpacity style={styles.copy} onPress={copy}><Ionicons name={copied?'checkmark':'copy-outline'} size={18} color="#6C4CF1"/><Text style={styles.revealText}>{copied?'Copied':'Copy private key'}</Text></TouchableOpacity>
    </ScrollView>}
    <WalletAuthorizationModal visible={authorizationVisible&&!key} action="export-secret" title="Verify to export private key" onAuthorized={handleAuthorized} onCancel={()=>{setAuthorizationVisible(false);router.back();}}/>
  </SafeAreaView>;
}
const styles=StyleSheet.create({container:{flex:1,backgroundColor:'#FFFFFF'},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:16,borderBottomWidth:1,borderColor:'#E8E4F3'},back:{color:'#6C4CF1',fontSize:16},headerTitle:{fontSize:16,fontWeight:'700',color:'#211B35'},center:{flex:1,alignItems:'center',justifyContent:'center',padding:24},title:{fontSize:24,fontWeight:'800',color:'#211B35',marginTop:18},subtitle:{fontSize:14,color:'#777286',textAlign:'center',marginVertical:20},body:{padding:20},warning:{flexDirection:'row',gap:10,padding:14,backgroundColor:'#FFF1F1',borderRadius:12},warningText:{flex:1,color:'#A33A3A',fontSize:13,lineHeight:19},reveal:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,padding:16},revealText:{color:'#6C4CF1',fontWeight:'700'},secret:{color:'#211B35',fontSize:14,lineHeight:22,padding:14,borderWidth:1,borderColor:'#E8E4F3',borderRadius:12},copy:{flexDirection:'row',justifyContent:'center',alignItems:'center',gap:8,padding:16}});
