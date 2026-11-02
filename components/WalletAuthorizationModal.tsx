import { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import PinPad from './PinPad';
import { authorizeWalletAction, type WalletAuthorization, type WalletSensitiveAction } from '../mobile/services/walletSecurityService';
export default function WalletAuthorizationModal({ visible, action, title, onAuthorized, onCancel }: { visible:boolean; action:WalletSensitiveAction; title:string; onAuthorized:(authorization:WalletAuthorization)=>void|Promise<void>; onCancel:()=>void }) {
 const [pin,setPin]=useState(''); const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
 useEffect(()=>{if(visible){setPin('');setError('');setBusy(false);}},[visible,action]);
 const change=async(value:string)=>{setPin(value);if(value.length!==6||busy)return;setBusy(true);try{const authorization=await authorizeWalletAction(value,action);if(!authorization){setError('Incorrect PIN or temporary lock active.');setPin('');setBusy(false);return;}await onAuthorized(authorization);}catch(e){setError(e instanceof Error?e.message:'Authorization failed.');setPin('');setBusy(false);}};
 return <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}><View style={styles.overlay}><View style={styles.card}><Text style={styles.title}>{title}</Text><Text style={styles.subtitle}>Verify your device PIN to continue.</Text><PinPad value={pin} onChange={change} maxLength={6} errorMsg={error}/><TouchableOpacity style={styles.cancel} onPress={onCancel} disabled={busy}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity></View></View></Modal>;
}
const styles=StyleSheet.create({overlay:{flex:1,backgroundColor:'rgba(20,16,38,0.5)',justifyContent:'center',padding:22},card:{backgroundColor:'#FFFFFF',borderRadius:20,padding:22,alignItems:'center'},title:{fontSize:19,fontWeight:'800',color:'#211B35',marginBottom:6},subtitle:{fontSize:13,color:'#777286',marginBottom:20},cancel:{marginTop:18,padding:10},cancelText:{color:'#6C4CF1',fontWeight:'700'}});
