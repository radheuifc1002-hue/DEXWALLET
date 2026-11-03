import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function Onboarding() {
  const router = useRouter();
  const [showActions, setShowActions] = useState(false);
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <View style={styles.brandMark}><Ionicons name="layers" size={36} color="#FFFFFF" /></View>
        <Text style={styles.logo}>XU</Text>
        <Text style={styles.brandCaption}>YOUR KEYS. YOUR COINS.</Text>
        <Text style={styles.chains}>Solana  ·  Ethereum  ·  BNB  ·  Polygon</Text>
        <Text style={styles.chains}>Arbitrum  ·  Bitcoin  ·  TRON</Text>
        <Text style={styles.descriptor}>A wallet that stays yours.</Text>
        <TouchableOpacity style={styles.continueBtn} onPress={() => setShowActions(true)} activeOpacity={0.86}>
          <Text style={styles.continueText}>Continue</Text>
          <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
      {showActions ? (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/generate-seed')} activeOpacity={0.85}>
            <Ionicons name="add-circle-outline" size={22} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>Create New Wallet</Text>
            <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push('/import-wallet')} activeOpacity={0.85}>
            <Ionicons name="key-outline" size={21} color="#6C4CF1" />
            <Text style={styles.secondaryBtnText}>Import Existing Wallet</Text>
            <Ionicons name="chevron-forward" size={18} color="#6C4CF1" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.backLink} onPress={() => setShowActions(false)}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </View>
      ) : <View style={styles.footer}><Text style={styles.footerText}>Secure wallet setup · No account required</Text></View>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:'#FFFFFF',paddingHorizontal:24,paddingTop:20,paddingBottom:30,justifyContent:'space-between'},
  hero:{flex:1,alignItems:'center',justifyContent:'center'},
  brandMark:{width:76,height:76,borderRadius:25,backgroundColor:'#6C4CF1',alignItems:'center',justifyContent:'center',marginBottom:18,shadowColor:'#6C4CF1',shadowOpacity:0.2,shadowRadius:16,shadowOffset:{width:0,height:8},elevation:5},
  logo:{fontSize:76,fontWeight:'900',color:'#211B35',letterSpacing:5,lineHeight:88},
  brandCaption:{fontSize:11,fontWeight:'900',letterSpacing:2.4,color:'#6C4CF1',marginTop:5,marginBottom:22},
  chains:{fontSize:13,color:'#777286',fontWeight:'600',textAlign:'center',lineHeight:22},
  descriptor:{fontSize:15,color:'#211B35',fontWeight:'600',marginTop:20,marginBottom:26},
  continueBtn:{width:'100%',height:58,borderRadius:17,backgroundColor:'#6C4CF1',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:12,shadowColor:'#6C4CF1',shadowOpacity:0.18,shadowRadius:12,shadowOffset:{width:0,height:5},elevation:4},
  continueText:{color:'#FFFFFF',fontSize:17,fontWeight:'800'},
  actions:{gap:12,paddingBottom:10},
  primaryBtn:{height:58,borderRadius:16,backgroundColor:'#6C4CF1',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10,paddingHorizontal:18},
  primaryBtnText:{color:'#FFFFFF',fontSize:16,fontWeight:'800',flex:1},
  secondaryBtn:{height:58,borderRadius:16,backgroundColor:'#FFFFFF',borderWidth:1.5,borderColor:'#6C4CF1',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10,paddingHorizontal:18},
  secondaryBtnText:{color:'#6C4CF1',fontSize:16,fontWeight:'800',flex:1},
  backLink:{alignItems:'center',paddingVertical:10},backText:{color:'#777286',fontSize:14,fontWeight:'700'},
  footer:{alignItems:'center',paddingVertical:10},footerText:{fontSize:11,color:'#A39DB2',fontWeight:'600'},
});
