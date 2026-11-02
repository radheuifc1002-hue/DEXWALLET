import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import PinPad from '../components/PinPad';
import { authorizeSensitiveAction, type AuthorizationGrant, type SensitiveScope } from '../mobile/services/walletSecurityService';
import WalletAuthorizationModal from '../components/WalletAuthorizationModal';
import type { WalletAuthorization, WalletSensitiveAction } from '../mobile/services/walletSecurityService';
import { useWallet, type Blockchain } from '../context/WalletContext';
import {
  createWalletVault, renameWalletVault, addMnemonicSource, addDerivedAccounts,
  addPrivateKeyAccount, addWatchOnlyAccount, renameWalletAccount, removeWalletAccount,
} from '../mobile/services/walletVaultService';

type Mode = 'vault'|'mnemonic'|'private'|'watch'|'rename'|'derive'|null;
const CHAINS: Blockchain[] = ['ethereum','bnb','polygon','solana'];
const CHAIN_NAMES: Record<Blockchain,string> = { ethereum:'Ethereum',bnb:'BNB Chain',polygon:'Polygon',solana:'Solana' };
const short = (value?:string) => value ? value.slice(0,8)+'…'+value.slice(-6) : 'Not available';

export default function WalletManagement() {
  const router=useRouter();
  const { walletVaultStore, activeWallet, activeVault, selectWalletAccount, refreshWalletVaultStore }=useWallet();
  const [mode,setMode]=useState<Mode>(null);
  const [targetVault,setTargetVault]=useState('');
  const [targetAccount,setTargetAccount]=useState('');
  const [name,setName]=useState('');
  const [secret,setSecret]=useState('');
  const [chain,setChain]=useState<Blockchain>('ethereum');
  const [addresses,setAddresses]=useState<Record<Blockchain,string>>({ethereum:'',bnb:'',polygon:'',solana:''});
  const [busy,setBusy]=useState(false);
  const [securityScope,setSecurityScope]=useState<SensitiveScope|null>(null);
  const [securityPin,setSecurityPin]=useState('');
  const [securityError,setSecurityError]=useState('');
  const [pendingDelete,setPendingDelete]=useState<{vaultId:string;accountId:string}|null>(null);
  const [batchCount,setBatchCount]=useState('5');
  const [authorizationRequest,setAuthorizationRequest]=useState<{action:WalletSensitiveAction;title:string;run:(authorization:WalletAuthorization)=>Promise<void>}|null>(null);
  const vaults=walletVaultStore?.vaults??[];

  const openMode=(next:Mode,vaultId?:string,accountId?:string)=>{
    setTargetVault(vaultId??activeVault?.id??vaults[0]?.id??'');
    setTargetAccount(accountId??'');
    setName('');
    setSecret('');
    setBatchCount('5');
    setAddresses({ethereum:'',bnb:'',polygon:'',solana:''});
    setMode(next);
  };
  const finish=async()=>{await refreshWalletVaultStore();setMode(null);setBusy(false);setSecret('');};
  const submit=async()=>{
    if(busy)return;
    if(mode==='mnemonic'||mode==='private'||mode==='derive'){
      const action:WalletSensitiveAction=mode==='derive'?'derive-account':'import-secret';
      setAuthorizationRequest({action,title:mode==='derive'?'Authorize account derivation':'Authorize secret import',run:async(auth)=>{await performSubmit(auth);setAuthorizationRequest(null);}});
      return;
    }
    await performSubmit();
  };
  const performSubmit=async(authorization?:WalletAuthorization)=>{
    if(busy)return;
    setBusy(true);
    try{
      if(mode==='vault'){
        await createWalletVault(name.trim()||'New Vault');
      }else if(mode==='mnemonic'){
        if(!targetVault)throw new Error('Create or select a vault first.');
        if(!authorization)throw new Error('PIN authorization required.');
        await addMnemonicSource(targetVault,secret,name.trim()||'Recovery Phrase',name.trim()||'Main Wallet',authorization);
      }else if(mode==='private'){
        if(!targetVault)throw new Error('Create or select a vault first.');
        if(!authorization)throw new Error('PIN authorization required.');
        await addPrivateKeyAccount(targetVault,chain,secret,name.trim()||'Imported Key',authorization);
      }else if(mode==='watch'){
        if(!targetVault)throw new Error('Create or select a vault first.');
        const input:Partial<Record<Blockchain,string>>={};
        for(const item of CHAINS)if(addresses[item].trim())input[item]=addresses[item].trim();
        await addWatchOnlyAccount(targetVault,input,name.trim()||'Watch Wallet');
      }else if(mode==='derive'){
        if(!targetVault||!targetAccount)throw new Error('Recovery phrase source not selected.');
        const count=Number(batchCount);
        if(!Number.isInteger(count)||count<1||count>20)throw new Error('Choose between 1 and 20 accounts.');
        if(!authorization)throw new Error('PIN authorization required.');
        await addDerivedAccounts(targetVault,targetAccount,count,name.trim()||'Account',authorization);
      }else if(mode==='rename'){
        if(!targetVault)throw new Error('Wallet or vault not selected.');
        if(targetAccount==='__vault__') await renameWalletVault(targetVault,name);
        else {
          if(!targetAccount)throw new Error('Wallet account not selected.');
          await renameWalletAccount(targetVault,targetAccount,name);
        }
      }
      await finish();
    }catch(error){
      setBusy(false);
      Alert.alert('Unable to update wallets',error instanceof Error?error.message:'Please check the details and try again.');
    }
  };
  const confirmSecurity=async(pin:string)=>{
    setSecurityPin(pin);
    if(pin.length!==6||!securityScope)return;
    const grant=await authorizeSensitiveAction(pin,securityScope);
    if(!grant){setSecurityError('Incorrect PIN or temporary lock active.');setSecurityPin('');return;}
    const scope=securityScope;setSecurityScope(null);setSecurityPin('');setSecurityError('');
    if(scope==='delete'&&pendingDelete){
      try{await removeWalletAccount(pendingDelete.vaultId,pendingDelete.accountId,grant);setPendingDelete(null);await refreshWalletVaultStore();}
      catch(e){Alert.alert('Unable to remove wallet',e instanceof Error?e.message:'Please try again.');}
    }else await submit(grant);
  };
  const activate=async(vaultId:string,accountId:string)=>{
    try{await selectWalletAccount(vaultId,accountId);router.replace('/(tabs)/home');}
    catch(error){Alert.alert('Wallet switch failed',error instanceof Error?error.message:'Please try again.');}
  };
  const remove= (vaultId:string,accountId:string,label:string)=>{
    Alert.alert('Remove '+label+'?', 'This removes this account from this device. It does not move or delete funds on-chain. Make sure its recovery information is safely backed up.',[
      {text:'Cancel',style:'cancel'},
      {text:'Continue',style:'destructive',onPress:()=>setAuthorizationRequest({action:'delete-account',title:'Authorize wallet removal',run:async(auth)=>{await removeWalletAccount(vaultId,accountId,auth);await refreshWalletVaultStore();setAuthorizationRequest(null);}})}
    ]);
  };
  return <SafeAreaView style={styles.container} edges={['top']}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={()=>router.back()}><Ionicons name="chevron-back" size={22} color="#211B35"/></TouchableOpacity>
        <View style={{flex:1}}><Text style={styles.title}>Wallets</Text><Text style={styles.subtitle}>Manage your vaults and accounts</Text></View>
        <TouchableOpacity style={styles.addVault} onPress={()=>openMode('vault')}><Ionicons name="add" size={17} color="#FFFFFF"/><Text style={styles.addVaultText}>Vault</Text></TouchableOpacity>
      </View>
      <View style={styles.activeCard}>
        <View style={styles.activeIcon}><Ionicons name="wallet" size={21} color="#6C4CF1"/></View>
        <View style={{flex:1}}><Text style={styles.activeLabel}>CURRENT WALLET</Text><Text style={styles.activeName}>{activeWallet?.name??'No wallet selected'}</Text><Text style={styles.activeAddress}>{short(Object.values(activeWallet?.addresses ?? {}).find(Boolean))}</Text></View>
        <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>ACTIVE</Text></View>
      </View>
      <View style={styles.quickActions}>
        <TouchableOpacity style={styles.quick} onPress={()=>openMode('mnemonic')}><Ionicons name="key-outline" size={18} color="#6C4CF1"/><Text style={styles.quickText}>Add recovery phrase</Text></TouchableOpacity>
        <TouchableOpacity style={styles.quick} onPress={()=>openMode('watch')}><Ionicons name="eye-outline" size={18} color="#6C4CF1"/><Text style={styles.quickText}>Add watch wallet</Text></TouchableOpacity>
        <TouchableOpacity style={styles.quick} onPress={()=>openMode('private')}><Ionicons name="key" size={18} color="#6C4CF1"/><Text style={styles.quickText}>Import private key</Text></TouchableOpacity>
      </View>
      {vaults.map(vault=><View key={vault.id} style={styles.vaultCard}>
        <View style={styles.vaultHeader}>
          <View style={{flex:1}}><Text style={styles.vaultName}>{vault.name}</Text><Text style={styles.vaultMeta}>{vault.sources.length} recovery sources · {vault.accounts.length} accounts</Text></View>
          <TouchableOpacity onPress={()=>{setTargetVault(vault.id);setTargetAccount('__vault__');setName(vault.name);setMode('rename');}}><Ionicons name="create-outline" size={19} color="#777286"/></TouchableOpacity>
        </View>
        {vault.accounts.map(account=>{
          const isActive=walletVaultStore?.activeAccountId===account.id;
          const chainAddress=Object.values(account.addresses).find(Boolean);
          return <View key={account.id} style={[styles.accountRow,isActive&&styles.accountActive]}>
            <TouchableOpacity style={styles.accountMain} onPress={()=>activate(vault.id,account.id)} activeOpacity={0.75}>
              <View style={[styles.accountIcon,account.sourceType==='watch-only'&&styles.watchIcon]}><Ionicons name={account.sourceType==='watch-only'?'eye-outline':'wallet-outline'} size={19} color={account.sourceType==='watch-only'?'#0D9488':'#6C4CF1'}/></View>
              <View style={{flex:1}}><View style={styles.nameLine}><Text style={styles.accountName}>{account.name}</Text>{account.sourceType==='watch-only'?<Text style={styles.watchBadge}>WATCH</Text>:null}</View><Text style={styles.accountAddress}>{short(chainAddress)}</Text><Text style={styles.accountType}>{account.sourceType==='mnemonic'?'Recovery phrase account':account.sourceType==='private-key'?'Imported private key':'Read-only address'}</Text></View>
              {isActive?<Ionicons name="checkmark-circle" size={21} color="#6C4CF1"/>:<Ionicons name="chevron-forward" size={18} color="#9B97B2"/>}
            </TouchableOpacity>
            <View style={styles.accountActions}>
              {account.sourceType==='private-key'?<TouchableOpacity onPress={()=>{void activate(vault.id,account.id).then(()=>router.push('/export-private-key'));}}><Ionicons name="download-outline" size={16} color="#6C4CF1"/></TouchableOpacity>:null}<TouchableOpacity onPress={()=>openMode('rename',vault.id,account.id)}><Ionicons name="pencil-outline" size={16} color="#777286"/></TouchableOpacity>
              <TouchableOpacity onPress={()=>remove(vault.id,account.id,account.name)}><Ionicons name="trash-outline" size={16} color="#DC6262"/></TouchableOpacity>
            </View>
          </View>;
        })}
        {vault.sources.filter(source=>source.type==='mnemonic').map(source=><TouchableOpacity key={source.id} style={styles.deriveRow} onPress={()=>openMode('derive',vault.id,source.id)}><Ionicons name="git-branch-outline" size={16} color="#6C4CF1"/><Text style={styles.deriveText}>Add accounts from {source.name}</Text><Ionicons name="add-circle-outline" size={18} color="#6C4CF1"/></TouchableOpacity>)}
        <View style={styles.vaultActions}><TouchableOpacity style={styles.vaultAction} onPress={()=>openMode('mnemonic',vault.id)}><Ionicons name="key-outline" size={15} color="#6C4CF1"/><Text style={styles.addToVaultText}>Recovery phrase</Text></TouchableOpacity><TouchableOpacity style={styles.vaultAction} onPress={()=>openMode('watch',vault.id)}><Ionicons name="eye-outline" size={15} color="#0D9488"/><Text style={styles.addToVaultText}>Watch wallet</Text></TouchableOpacity><TouchableOpacity style={styles.vaultAction} onPress={()=>openMode('private',vault.id)}><Ionicons name="key" size={15} color="#6C4CF1"/><Text style={styles.addToVaultText}>Private key</Text></TouchableOpacity></View>
      </View>)}
      {vaults.length===0?<View style={styles.empty}><Ionicons name="wallet-outline" size={38} color="#9B97B2"/><Text style={styles.emptyTitle}>No vaults found</Text><Text style={styles.emptyText}>Create a vault or add a wallet to get started.</Text></View>:null}
      <View style={styles.footerNote}><Ionicons name="shield-checkmark-outline" size={16} color="#0D9488"/><Text style={styles.footerText}>Recovery phrases and private keys remain in device secure storage. Watch wallets are read-only.</Text></View>
    </ScrollView>
    <WalletAuthorizationModal visible={authorizationRequest!==null} action={authorizationRequest?.action??'import-secret'} title={authorizationRequest?.title??'Authorize'} onCancel={()=>setAuthorizationRequest(null)} onAuthorized={async(auth)=>{if(authorizationRequest)await authorizationRequest.run(auth);}} />
    <Modal visible={mode!==null} transparent animationType="slide" onRequestClose={()=>setMode(null)}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS==='ios'?'padding':undefined}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>{mode==='vault'?'Create vault':mode==='mnemonic'?'Add recovery phrase':mode==='private'?'Import private key':mode==='watch'?'Add watch wallet':mode==='derive'?'Add derived accounts':'Rename'}</Text><TouchableOpacity onPress={()=>setMode(null)}><Ionicons name="close" size={22} color="#777286"/></TouchableOpacity></View>
          {mode==='vault'||mode==='rename'?<TextInput style={styles.input} value={name} onChangeText={setName} placeholder={mode==='vault'?'Vault name':'New name'} placeholderTextColor="#9B97B2" autoCapitalize="words"/>:null}
          {mode==='derive'?<><Text style={styles.fieldLabel}>Number of accounts (1–20)</Text><TextInput style={styles.input} value={batchCount} onChangeText={setBatchCount} keyboardType="number-pad" placeholder="5" placeholderTextColor="#9B97B2"/><Text style={styles.fieldLabel}>Account name prefix</Text><TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Account" placeholderTextColor="#9B97B2" autoCapitalize="words"/><Text style={styles.helper}>New accounts are derived locally from this recovery phrase. The phrase remains in secure device storage.</Text></>:null}
          {mode==='mnemonic'?<><Text style={styles.fieldLabel}>Recovery phrase (12 or 24 words)</Text><TextInput style={[styles.input,styles.secretInput]} value={secret} onChangeText={setSecret} placeholder="Enter recovery phrase" placeholderTextColor="#9B97B2" autoCapitalize="none" autoCorrect={false} secureTextEntry multiline={false}/><Text style={styles.helper}>This phrase is processed locally and stored in secure device storage.</Text></>:null}
          {mode==='private'?<><Text style={styles.fieldLabel}>Blockchain</Text><View style={styles.chainChips}>{CHAINS.map(item=><TouchableOpacity key={item} style={[styles.chainChip,chain===item&&styles.chainChipActive]} onPress={()=>setChain(item)}><Text style={[styles.chainChipText,chain===item&&styles.chainChipTextActive]}>{CHAIN_NAMES[item]}</Text></TouchableOpacity>)}</View><Text style={styles.fieldLabel}>Private key</Text><TextInput style={styles.input} value={secret} onChangeText={setSecret} placeholder="Enter private key" placeholderTextColor="#9B97B2" autoCapitalize="none" autoCorrect={false} secureTextEntry/></>:null}
          {mode==='watch'?<><Text style={styles.fieldLabel}>Enter any addresses you want to watch</Text>{CHAINS.map(item=><View key={item} style={styles.addressField}><Text style={styles.addressLabel}>{CHAIN_NAMES[item]}</Text><TextInput style={styles.input} value={addresses[item]} onChangeText={value=>setAddresses(current=>({...current,[item]:value}))} placeholder={item==='solana'?'Solana public address':'0x… public address'} placeholderTextColor="#9B97B2" autoCapitalize="none" autoCorrect={false}/></View>)}</>:null}
          {mode!=='vault'&&mode!=='rename'&&mode!=='derive'?<TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Wallet name (optional)" placeholderTextColor="#9B97B2" autoCapitalize="words"/>:null}
          <TouchableOpacity style={[styles.submit,busy&&{opacity:0.6}]} onPress={submit} disabled={busy}><Text style={styles.submitText}>{busy?'Saving…':mode==='vault'?'Create vault':mode==='rename'?'Save name':mode==='derive'?'Create accounts':'Add wallet'}</Text></TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
    <Modal visible={securityScope!==null} transparent animationType="fade" onRequestClose={()=>{setSecurityScope(null);setPendingDelete(null);}}>
      <View style={styles.modalOverlay}><View style={styles.modalCard}>
        <Text style={styles.modalTitle}>Confirm with your PIN</Text>
        <Text style={styles.helper}>{securityScope==='delete'?'Authorize removal of this account.':securityScope==='derive'?'Authorize deriving additional accounts.':'Authorize access to wallet secrets.'}</Text>
        <PinPad value={securityPin} onChange={confirmSecurity} maxLength={6} errorMsg={securityError}/>
        <TouchableOpacity onPress={()=>{setSecurityScope(null);setPendingDelete(null);setSecurityPin('');}}><Text style={styles.backText}>Cancel</Text></TouchableOpacity>
      </View></View>
    </Modal>
  </SafeAreaView>;
}
const styles=StyleSheet.create({
 container:{flex:1,backgroundColor:'#FFFFFF'},content:{padding:18,paddingBottom:38},
 header:{flexDirection:'row',alignItems:'center',gap:12,marginBottom:18},back:{width:38,height:38,borderRadius:12,backgroundColor:'#F3F0FF',alignItems:'center',justifyContent:'center'},title:{fontSize:25,fontWeight:'900',color:'#211B35'},subtitle:{fontSize:12,color:'#777286',marginTop:3},addVault:{flexDirection:'row',alignItems:'center',gap:4,paddingHorizontal:12,paddingVertical:10,borderRadius:12,backgroundColor:'#6C4CF1'},addVaultText:{fontSize:12,fontWeight:'800',color:'#FFFFFF'},
 activeCard:{flexDirection:'row',alignItems:'center',gap:12,padding:16,borderRadius:18,backgroundColor:'#F8F6FF',borderWidth:1,borderColor:'#E8E4F3',marginBottom:14},activeIcon:{width:42,height:42,borderRadius:14,backgroundColor:'#EEE9FF',alignItems:'center',justifyContent:'center'},activeLabel:{fontSize:10,fontWeight:'800',color:'#777286',letterSpacing:1},activeName:{fontSize:16,fontWeight:'900',color:'#211B35',marginTop:3},activeAddress:{fontSize:11,color:'#777286',marginTop:3,fontFamily:'monospace'},activeBadge:{backgroundColor:'#EDE9FE',paddingHorizontal:8,paddingVertical:5,borderRadius:8},activeBadgeText:{fontSize:9,fontWeight:'900',color:'#6C4CF1'},
 quickActions:{gap:8,marginBottom:16},quick:{flexDirection:'row',alignItems:'center',gap:10,padding:13,borderRadius:13,borderWidth:1,borderColor:'#E8E4F3',backgroundColor:'#FFFFFF'},quickText:{fontSize:13,fontWeight:'700',color:'#211B35'},
 vaultCard:{padding:14,borderRadius:18,borderWidth:1,borderColor:'#E8E4F3',marginBottom:14,backgroundColor:'#FFFFFF'},vaultHeader:{flexDirection:'row',alignItems:'center',marginBottom:8},vaultName:{fontSize:16,fontWeight:'900',color:'#211B35'},vaultMeta:{fontSize:11,color:'#777286',marginTop:3},
 accountRow:{borderTopWidth:1,borderTopColor:'#F0EDF7',paddingTop:10,paddingBottom:8},accountActive:{backgroundColor:'#FAF9FF',marginHorizontal:-6,paddingHorizontal:6,borderRadius:12},accountMain:{flexDirection:'row',alignItems:'center',gap:10},accountIcon:{width:38,height:38,borderRadius:13,backgroundColor:'#F1EDFF',alignItems:'center',justifyContent:'center'},watchIcon:{backgroundColor:'#E6F7F4'},nameLine:{flexDirection:'row',alignItems:'center',gap:7},accountName:{fontSize:13,fontWeight:'800',color:'#211B35'},watchBadge:{fontSize:8,fontWeight:'900',color:'#0D9488',backgroundColor:'#E6F7F4',paddingHorizontal:6,paddingVertical:3,borderRadius:5},accountAddress:{fontSize:10,color:'#777286',fontFamily:'monospace',marginTop:3},accountType:{fontSize:10,color:'#9B97B2',marginTop:2},accountActions:{flexDirection:'row',justifyContent:'flex-end',gap:18,paddingRight:5,paddingTop:6},deriveRow:{flexDirection:'row',alignItems:'center',gap:8,paddingVertical:10,borderTopWidth:1,borderTopColor:'#F0EDF7'},deriveText:{flex:1,fontSize:11,fontWeight:'700',color:'#6C4CF1'},vaultActions:{flexDirection:'row',flexWrap:'wrap',gap:8,paddingTop:10,borderTopWidth:1,borderTopColor:'#F0EDF7'},vaultAction:{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:9,paddingVertical:8,borderRadius:9,backgroundColor:'#F8F6FF'},addToVaultText:{fontSize:11,fontWeight:'700',color:'#6C4CF1'},
 empty:{alignItems:'center',padding:32,gap:8},emptyTitle:{fontSize:16,fontWeight:'800',color:'#211B35'},emptyText:{fontSize:12,color:'#777286',textAlign:'center'},footerNote:{flexDirection:'row',gap:8,alignItems:'flex-start',padding:13,backgroundColor:'#EAF8F4',borderRadius:12,marginTop:4},footerText:{flex:1,fontSize:11,color:'#387568',lineHeight:16},
 modalOverlay:{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(20,16,38,0.45)'},modalCard:{backgroundColor:'#FFFFFF',padding:20,paddingBottom:30,borderTopLeftRadius:24,borderTopRightRadius:24,gap:12},modalHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:4},modalTitle:{fontSize:19,fontWeight:'900',color:'#211B35'},fieldLabel:{fontSize:12,fontWeight:'800',color:'#777286'},input:{borderWidth:1,borderColor:'#E8E4F3',borderRadius:12,paddingHorizontal:13,paddingVertical:12,color:'#211B35',fontSize:14,backgroundColor:'#FFFFFF'},secretInput:{letterSpacing:1},helper:{fontSize:11,color:'#777286',lineHeight:16},chainChips:{flexDirection:'row',flexWrap:'wrap',gap:7},chainChip:{paddingHorizontal:10,paddingVertical:8,borderRadius:9,borderWidth:1,borderColor:'#E8E4F3'},chainChipActive:{backgroundColor:'#F3F0FF',borderColor:'#6C4CF1'},chainChipText:{fontSize:10,color:'#777286',fontWeight:'700'},chainChipTextActive:{color:'#6C4CF1'},addressField:{gap:5},addressLabel:{fontSize:10,fontWeight:'800',color:'#777286'},submit:{backgroundColor:'#6C4CF1',paddingVertical:15,borderRadius:13,alignItems:'center',marginTop:4},submitText:{color:'#FFFFFF',fontSize:14,fontWeight:'900'}
});
