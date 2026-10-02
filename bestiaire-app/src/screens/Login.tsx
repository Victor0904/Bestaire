import { useState } from 'react';
import { supabase, configured } from '../lib/supabase';
import { errMsg } from '../lib/api';

export function Login() {
  const [email, setEmail] = useState(''); const [pwd, setPwd] = useState(''); const [mode, setMode] = useState<'link' | 'pwd'>('link');
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const redirect = location.origin + location.pathname;
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg('');
    try {
      if (mode === 'link') { const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } }); if (error) throw error; setMsg('Regarde ta boîte mail : un lien de connexion vient de partir.') }
      else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pwd });
        if (error) { const r = await supabase.auth.signUp({ email, password: pwd, options: { emailRedirectTo: redirect } }); if (r.error) throw r.error; if (!r.data.session) setMsg('Compte créé : confirme ton adresse depuis le mail reçu.') }
      }
    } catch (e) { setMsg(errMsg(e)) } finally { setBusy(false) }
  };
  return (
    <div className="login">
      <h1 className="brand big">Bestiaire</h1>
      <p className="tagline">Photographie la faune de France selon l'heure, la saison et le milieu. Collectionne, fusionne, combats, échange.</p>
      {!configured && <p className="err">Configuration manquante : renseigne VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans le fichier .env (voir README).</p>}
      <form className="panel" onSubmit={go}>
        <label className="field">Adresse e-mail<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
        {mode === 'pwd' && <label className="field">Mot de passe<input type="password" required minLength={6} autoComplete="current-password" value={pwd} onChange={e => setPwd(e.target.value)} /></label>}
        <button className="btn primary big" disabled={busy}>{mode === 'link' ? 'Recevoir un lien de connexion' : 'Se connecter / créer mon compte'}</button>
        <button type="button" className="linkbtn" onClick={() => setMode(mode === 'link' ? 'pwd' : 'link')}>{mode === 'link' ? 'Utiliser un mot de passe' : 'Recevoir plutôt un lien par e-mail'}</button>
        <button type="button" className="btn ghost" onClick={() => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirect } })}>Continuer avec Google</button>
        {msg && <p className="note" role="status">{msg}</p>}
      </form>
    </div>
  );
}
