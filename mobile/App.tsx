import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { ApiError, request, type Book, type FoundBook } from './api';

type Tab = 'library' | 'add';
const normalize = (value: string) => value.replace(/[\s-]/g, '').toUpperCase();
const searchable = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function validIsbn(value: string) {
  if (/^\d{9}[\dX]$/.test(value)) {
    return value.split('').reduce((sum, char, i) => sum + (char === 'X' ? 10 : Number(char)) * (10 - i), 0) % 11 === 0;
  }
  if (/^\d{13}$/.test(value)) {
    return value.split('').reduce((sum, char, i) => sum + Number(char) * (i % 2 ? 3 : 1), 0) % 10 === 0;
  }
  return false;
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tab, setTab] = useState<Tab>('library');
  const [books, setBooks] = useState<Book[]>([]);
  const [search, setSearch] = useState('');
  const [updatingBook, setUpdatingBook] = useState<number | null>(null);
  const [isbn, setIsbn] = useState('');
  const [found, setFound] = useState<FoundBook | null>(null);
  const [scanning, setScanning] = useState(false);
  const scanLocked = useRef(false);
  const [permission, askPermission] = useCameraPermissions();
  const [message, setMessage] = useState('');

  const handleError = useCallback((error: unknown) => {
    if (error instanceof ApiError && error.status === 401) {
      setAuthenticated(false); setFound(null); setScanning(false);
    }
    setMessage(error instanceof Error ? error.message : 'Connexion impossible. Vérifiez votre réseau.');
  }, []);

  const refresh = useCallback(async () => {
    try { setBooks(await request<Book[]>('/bibliotheque')); }
    catch (error) { handleError(error); }
  }, [handleError]);

  useEffect(() => {
    request('/users/me').then(() => { setAuthenticated(true); void refresh(); })
      .catch((error) => { if (!(error instanceof ApiError && error.status === 401)) handleError(error); })
      .finally(() => setInitializing(false));
  }, [refresh, handleError]);

  async function login() {
    if (loading) return;
    setLoading(true); setMessage('');
    try {
      await request('/auth/login', 'POST', { email: email.trim(), mot_de_passe: password });
      setPassword(''); setAuthenticated(true); await refresh();
    } catch (error) { handleError(error); }
    finally { setLoading(false); }
  }

  async function logout() {
    setLoading(true);
    try { await request('/auth/logout', 'POST'); }
    catch (error) { handleError(error); }
    finally { setAuthenticated(false); setBooks([]); setFound(null); setScanning(false); setLoading(false); setMessage(''); }
  }

  async function lookup(raw: string) {
    const value = normalize(raw);
    setIsbn(value); setFound(null); setScanning(false);
    if (!validIsbn(value)) { setMessage('Saisissez un ISBN-10 ou ISBN-13 valide.'); return; }
    setLoading(true); setMessage('');
    try { setFound(await request<FoundBook>('/livres/isbn', 'POST', { isbn: value })); }
    catch (error) { handleError(error); }
    finally { setLoading(false); }
  }

  async function add() {
    if (!found || loading) return;
    setLoading(true); setMessage('');
    try {
      await request('/bibliotheque', 'POST', { livre_id: found.id });
      await refresh(); setFound(null); setIsbn('');
      setMessage('Livre ajouté à votre bibliothèque.');
    } catch (error) { handleError(error); }
    finally { setLoading(false); }
  }

  async function toggleRead(book: Book) {
    if (updatingBook !== null) return;
    setUpdatingBook(book.livre_id); setMessage('');
    try {
      const updated = await request<{ livre_id: number; lu: boolean }>(`/bibliotheque/${book.livre_id}`, 'PATCH', { lu: !book.lu });
      if (updated.livre_id !== book.livre_id || typeof updated.lu !== 'boolean') {
        throw new Error('Réponse inattendue. Actualisez la liste pour vérifier le livre.');
      }
      setBooks(current => current.map(item => item.livre_id === book.livre_id ? { ...item, lu: updated.lu } : item));
    } catch (error) { handleError(error); }
    finally { setUpdatingBook(null); }
  }

  async function openCamera() {
    setMessage('');
    const access = permission?.granted ? permission : await askPermission();
    if (!access.granted) { setMessage('Autorisez la caméra dans les paramètres pour scanner un ISBN.'); return; }
    scanLocked.current = false; setScanning(true); setFound(null);
  }

  const button = (label: string, action: () => void, disabled = false) => (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={action} style={[styles.button, disabled && styles.disabled]}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );

  const query = searchable(search.trim());
  const visibleBooks = query ? books.filter(book =>
    [book.titre, book.auteur, book.isbn ?? ''].some(value => searchable(value).includes(query))
  ) : books;

  return <SafeAreaProvider><SafeAreaView style={styles.root}>
    <StatusBar style="dark" />
    {initializing ? <ActivityIndicator style={styles.center} size="large" /> : !authenticated ?
      <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Text style={styles.title}>Ma Bibliothèque</Text>
        <Text style={styles.subtitle}>Connectez-vous pour retrouver vos livres.</Text>
        <TextInput style={styles.input} placeholder="Adresse e-mail" accessibilityLabel="Adresse e-mail" autoCapitalize="none" keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} />
        <TextInput style={styles.input} placeholder="Mot de passe" accessibilityLabel="Mot de passe" secureTextEntry autoComplete="password" value={password} onChangeText={setPassword} />
        {button(loading ? 'Connexion…' : 'Se connecter', () => void login(), loading || !email || !password)}
        {!!message && <Text style={styles.error} accessibilityRole="alert">{message}</Text>}
      </KeyboardAvoidingView> : <>
        <View style={styles.header}><Text style={styles.title}>Ma Bibliothèque</Text><Pressable accessibilityRole="button" onPress={() => void logout()}><Text style={styles.link}>Déconnexion</Text></Pressable></View>
        <View style={styles.tabs}>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'library' }} onPress={() => { setTab('library'); setMessage(''); void refresh(); }} style={[styles.tab, tab === 'library' && styles.selected]}><Text>Mes livres</Text></Pressable>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'add' }} onPress={() => { setTab('add'); setMessage(''); }} style={[styles.tab, tab === 'add' && styles.selected]}><Text>Ajouter un livre</Text></Pressable>
        </View>
        {!!message && <Text style={styles.notice} accessibilityRole="alert">{message}</Text>}
        {tab === 'library' ? <View style={styles.content}>
          <>
            <Text style={styles.bookTitle}>Rechercher dans mes livres</Text>
            <Text style={styles.subtitle}>Par titre, auteur ou ISBN</Text>
            <TextInput style={styles.input} placeholder="Titre, auteur ou ISBN…" placeholderTextColor="#65766a" accessibilityLabel="Rechercher dans ma bibliothèque" value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} returnKeyType="search" clearButtonMode="while-editing" />
            {!!search && button('Effacer la recherche', () => setSearch(''))}
          </>
          {button('Actualiser', () => void refresh())}
          <FlatList data={visibleBooks} keyExtractor={book => String(book.livre_id)} keyboardShouldPersistTaps="handled" ListEmptyComponent={<Text style={styles.empty}>{books.length === 0 ? 'Votre bibliothèque est vide.' : 'Aucun livre ne correspond à votre recherche.'}</Text>}
            renderItem={({ item }) => <View style={styles.card}><Text style={styles.bookTitle}>{item.titre}</Text><Text>{item.auteur}</Text><Text style={styles.meta}>{item.lu ? 'Lu' : 'Non lu'}{item.isbn ? ` · ISBN ${item.isbn}` : ''}</Text>
              {button(updatingBook === item.livre_id ? 'Enregistrement…' : item.lu ? 'Marquer comme non lu' : 'Marquer comme lu', () => void toggleRead(item), updatingBook !== null)}
            </View>} />
        </View> : <View style={styles.content}>
          {scanning ? <>
            <Text style={styles.subtitle}>Placez le code-barres du livre dans le cadre.</Text>
            <CameraView style={styles.camera} barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a'] }}
              onBarcodeScanned={({ data }) => { if (scanLocked.current) return; scanLocked.current = true; void lookup(data); }} />
            {button('Annuler le scan', () => setScanning(false))}
          </> : <>
            <Text style={styles.subtitle}>Scanner le code-barres ISBN avec la caméra</Text>
            {button('Ouvrir la caméra', () => void openCamera())}
            <Text style={styles.subtitle}>Ou écrire l’ISBN</Text>
            <TextInput style={styles.input} placeholder="9782070612758" accessibilityLabel="ISBN du livre" keyboardType="default" autoCapitalize="characters" value={isbn} onChangeText={value => { setIsbn(value); setFound(null); }} maxLength={24} />
            {button(loading ? 'Recherche…' : 'Rechercher ce livre', () => void lookup(isbn), loading || !isbn.trim())}
            {found && <View style={styles.card}><Text style={styles.bookTitle}>{found.title || 'Titre indisponible'}</Text><Text>{found.authors.join(', ') || 'Auteur inconnu'}</Text><Text style={styles.meta}>ISBN {isbn}</Text>{button(loading ? 'Ajout…' : 'Ajouter à ma bibliothèque', () => void add(), loading)}</View>}
          </>}
        </View>}
      </>}
  </SafeAreaView></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f7f6f2' }, center: { flex: 1 }, page: { flex: 1, justifyContent: 'center', padding: 24, gap: 14 }, header: { padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 25, fontWeight: '700', color: '#19392d', flexShrink: 1 }, subtitle: { fontSize: 16, color: '#4e6056', marginTop: 12, marginBottom: 8 },
  link: { color: '#116a50', fontWeight: '600' }, input: { backgroundColor: 'white', color: '#19392d', borderWidth: 1, borderColor: '#b8c9be', borderRadius: 10, padding: 14, fontSize: 16 },
  button: { backgroundColor: '#176b50', borderRadius: 10, padding: 14, alignItems: 'center', marginVertical: 7 }, disabled: { opacity: 0.5 }, buttonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  tabs: { flexDirection: 'row', paddingHorizontal: 20, gap: 12 }, tab: { flex: 1, alignItems: 'center', padding: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' }, selected: { borderBottomColor: '#176b50' },
  content: { flex: 1, padding: 20 }, card: { backgroundColor: 'white', borderRadius: 12, padding: 18, marginTop: 12, gap: 7 }, bookTitle: { fontSize: 18, fontWeight: '700', color: '#19392d' }, meta: { color: '#65766a' },
  empty: { textAlign: 'center', marginTop: 36, color: '#65766a' }, error: { color: '#ad312d' }, notice: { paddingHorizontal: 20, color: '#8b481e' }, camera: { flex: 1, borderRadius: 12, overflow: 'hidden' },
});
