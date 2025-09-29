(function(){
  "use strict";

  /* ===== Supabase Client & Auth ===== */
  let supabase = null;
  if (window.supabase) {
    supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON);
    window.supabaseClient = supabase; // Expor o cliente para ser reutilizado
  }

  async function getSession() {
    if (!supabase) return null;
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  }

  /* ================================== */

  /* ===== Lógica do Menu Mobile ===== */
  const burger = document.querySelector('.burger');
  const panel  = document.getElementById('mobileNav');
  const scrim  = document.getElementById('scrim');
  const body   = document.body;
  let scrollLockY = 0;

  function closeNav(){
    if (!panel || !panel.classList.contains('open')) return;
    panel.classList.remove('open');
    scrim.classList.remove('open');
    body.classList.remove('no-scroll');
    body.style.top = '';
    window.scrollTo(0, scrollLockY);
    burger.setAttribute('aria-expanded','false');
    panel.setAttribute('aria-hidden','true');
  }
  function openNav(){
    scrollLockY = window.scrollY || window.pageYOffset || 0;
    body.style.top = `-${scrollLockY}px`;
    body.classList.add('no-scroll');
    panel.classList.add('open');
    scrim.classList.add('open');
    burger.setAttribute('aria-expanded','true');
    panel.setAttribute('aria-hidden','false');
  }
  if (burger && panel && scrim) {
    burger.addEventListener('click', ()=> panel.classList.contains('open') ? closeNav() : openNav());
    panel.addEventListener('click', e => { if (e.target.closest('a')) closeNav(); });
    scrim.addEventListener('click', closeNav);
    window.addEventListener('keydown', e => { if (e.key === 'Escape') closeNav(); });
  }

  /* ===== Lógica de Autenticação (UI) ===== */
  async function updateAuthUI(session) {
    const authLinks = document.querySelectorAll('[data-auth-link]');
    const authContainers = document.querySelectorAll('[data-auth-container]');

    // Limpa sempre os botões de logout para evitar duplicados em mudanças de estado
    document.querySelectorAll('.logout-btn-main').forEach(btn => btn.remove());

    if (session) { // User is logged in
      let displayName = 'O Meu Perfil'; // Texto por defeito
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', session.user.id)
          .single();

        if (error && error.status !== 406) { // 406 significa que não encontrou a linha, o que é ok
          console.error('Erro a obter perfil:', error);
        }

        if (profile && profile.full_name) {
          displayName = profile.full_name;
        }
      } catch (e) {
        console.error('Falha na obtenção do perfil:', e);
      }

      authLinks.forEach(link => {
        link.href = 'perfil.html';
        link.textContent = displayName;
        link.classList.remove('login-btn');
        link.classList.add('profile-link'); // Classe para styling
      });

      authContainers.forEach(container => {
        const logoutBtn = document.createElement('a');
        logoutBtn.textContent = 'Sair';
        logoutBtn.href = '#';
        logoutBtn.className = 'login-btn logout-btn-main'; // Reutiliza estilos
        logoutBtn.onclick = async (e) => {
          e.preventDefault();
          if (supabase) await supabase.auth.signOut();
        };
        container.appendChild(logoutBtn);
      });

    } else { // User is logged out
      authLinks.forEach(link => {
        link.href = 'login.html';
        link.textContent = 'Login / Registar';
        link.classList.add('login-btn');
        link.classList.remove('profile-link');
      });
    }
  }

  async function handleAuth() {
    if (!supabase) return;
 
    const protectedPages = ['perfil.html'];
    const publicOnlyPages = ['login.html', 'Registro.html', 'recuperar_senha.html'];
 
    const pathParts = window.location.pathname.split('/');
    const currentPage = pathParts.pop() || 'index.html';
 
    // PASSO 1: Obter a sessão atual para as verificações de guarda da página.
    // Isto é executado ANTES de o resto da página carregar, prevenindo o acesso indevido.
    const { data: { session } } = await supabase.auth.getSession();

    // PASSO 2: Executar as guardas de página imediatamente.
    // Se um utilizador não logado aceder a 'perfil.html', é redirecionado ANTES de a página tentar carregar os dados.
    // Isto resolve o problema de a página ficar "A carregar...".
    if (!session && protectedPages.includes(currentPage)) {
        const redirectTo = encodeURIComponent(currentPage + window.location.search + window.location.hash);
        window.location.href = `login.html?next=${redirectTo}`;
        return; // Pára a execução para garantir o redirecionamento.
    }
 
    // Se um utilizador logado aceder a 'login.html', é redirecionado para o perfil.
    if (session && publicOnlyPages.includes(currentPage)) {
        const urlParams = new URLSearchParams(window.location.search);
        const nextUrl = urlParams.get('next');
        window.location.href = nextUrl ? decodeURIComponent(nextUrl) : 'perfil.html';
        return; // Pára a execução.
    }

    // PASSO 3: Configurar o listener para TODAS as atualizações de UI e eventos futuros.
    // onAuthStateChange é a "fonte da verdade". Ele é despoletado no carregamento da página
    // com o estado atual e em qualquer mudança (login/logout), garantindo que a UI está sempre sincronizada.
    supabase.auth.onAuthStateChange(async (_event, session) => {
        // A. Atualizar sempre a UI (cabeçalho, etc.) para refletir o estado.
        try {
            await updateAuthUI(session);
        } catch (error) {
            console.error("Falha ao atualizar a UI de autenticação:", error);
        }

        // B. Lidar com o caso específico de logout numa página protegida.
        // Isto resolve o problema do botão "Sair" que não redirecionava.
        if (_event === 'SIGNED_OUT' && protectedPages.includes(currentPage)) {
            window.location.href = 'index.html';
        }
    });
  }

  /* ===== Lógica de Gestão de Idiomas (i18n) ===== */
  const LS_KEY='lang';
  const lang1=document.getElementById('langSwitch');
  const lang2=document.getElementById('langSwitch2');

  // Dicionário de fallback (baseado no index.html, o mais completo)
  const fallback={pt:{
    "site.title":"Aldeia Segura Pessoas Seguras",
    "nav.home":"Início","nav.understand":"Compreender","nav.explore":"Explorar","nav.reduce":"Reduzir","nav.villages":"Aldeias Seguras","nav.contact":"Contacto","nav.login":"Login / Registar", "nav.report": "Fogo à Vista",
    "hero.title":"Bem-vindo aos programas Aldeia Segura Pessoas Seguras","hero.sub":"Prevenir é agir antes. Evacuar é salvar-se a tempo.",
    "cta.report.title":"Viu um incêndio? Relate aqui","cta.report.desc":"Marque o local no mapa, indique a data/hora e descreva o que está a ver.","cta.report.btn":"🔥 Relatar Incêndio",
    "cards.understand.title":"Compreender","cards.understand.desc":"Entenda mais relativamente aos incêndios e o impacto no território.",
    "cards.explore.title":"Explorar","cards.explore.desc":"Visualize mapas interativos com níveis de risco.",
    "cards.reduce.title":"Reduzir","cards.reduce.desc":"Descubra medidas práticas para reduzir o risco.",
    "cards.villages.title":"Aldeias Seguras","cards.villages.desc":"Conheça onde existem aldeias seguras.",
    "program.title":"Programas “Aldeia Segura / Pessoas Seguras”","program.lead":"Criado pela Resolução do Conselho de Ministros n.º 157-A/2017, o programa integra a reforma na prevenção e resposta a incêndios rurais, reforçando a segurança de pessoas e bens na interface urbano-florestal.","program.what.title":"O que são os Programas","program.what.p1":"Aldeia Segura estabelece medidas estruturais para proteger aglomerados situados na interface urbano-florestal: criação e gestão de zonas de proteção, identificação de pontos críticos, e definição de locais de abrigo/refúgio.","program.what.p2":"Pessoas Seguras centra-se na população: sensibilização para evitar comportamentos de risco, medidas de autoproteção e realização de simulacros dos planos de evacuação, em articulação com municípios e freguesias.","program.objective.title":"Objetivo","program.objective.text":"Proteger pessoas e património nos aglomerados em contacto com áreas florestais, através de zonas de proteção, locais de abrigo/refúgio, informação ao público e preparação para evacuar ou permanecer com segurança, conforme a evolução do incêndio.","program.impl.title":"Implementação","program.impl.p0":"Execução ao abrigo de protocolo entre a ANEPC, ANMP e ANAFRE, em dois níveis:","program.impl.strategic":"Nível estratégico (Administração Central/ANEPC): referenciais nacionais, campanhas e sistemas de aviso.","program.impl.operational":"Nível operativo (Municípios/Freguesias): medidas locais de proteção e sensibilização, tirando partido da proximidade às comunidades.","program.lines.title":"Linhas de ação","program.lines.l1":"Proteção a aglomerados","program.lines.l2":"Prevenção de comportamentos de risco","program.lines.l3":"Sensibilização e aviso à população","program.lines.l4":"Evacuação de aglomerados","program.lines.l5":"Locais de abrigo e refúgio","program.docs.title":"Documentos","program.docs.desc":"Guias e referenciais de apoio à implementação.","program.cta.pt":"📘 Guia de Apoio (PT)","program.cta.en":"📎 Guia de Apoio (EN)","program.cta.off":"🌐 Programa (site oficial)","how.title":"Como participar na tua aldeia","how.step1.t":"1) Informa-te","how.step1.d":"Confirma se o teu aglomerado está no programa e conhece o Oficial de Segurança Local (OSL).","how.step2.t":"2) Contribui","how.step2.d":"Ajuda a manter os dados da tua aldeia atualizados. Sinaliza também problemas que encontres no terreno.","how.step2.cta":"Adiciona informação/comentário","how.step3.t":"3) Treina","how.step3.d":"Participa nos simulacros e divulga as medidas de autoproteção aos vizinhos mais vulneráveis.","emerg.title":"⚠️ Em caso de emergência ⚠️","emerg.text":"Ligue imediatamente <strong>112</strong>.","footer.copy":"© 2025 Ruben Sousa · Todos os direitos reservados"
  }, en:{
    "site.title":"Safe Village Safe People","nav.home":"Home","nav.understand":"Understand","nav.explore":"Explore","nav.reduce":"Reduce","nav.villages":"Safe Villages","nav.contact":"Contact","nav.login":"Login / Sign up","hero.title":"Welcome to the Safe Village Safe People programme","hero.sub":"Prevention means acting early. Evacuation means leaving in time.","cta.report.title":"Saw a wildfire? Report it here","cta.report.desc":"Pin the location on the map, add date/time and describe what you see.","cta.report.btn":"🔥 Report Wildfire","cards.understand.title":"Understand","cards.understand.desc":"Learn about wildfires and their impacts on the territory.","cards.explore.title":"Explore","cards.explore.desc":"Explore interactive risk maps.","cards.reduce.title":"Reduce","cards.reduce.desc":"Practical measures to reduce risk.","cards.villages.title":"Safe Villages","cards.villages.desc":"See where there are designated safe villages.","program.title":"“Safe Village / Safe People” Programme","program.lead":"Created by Council of Ministers Resolution No. 157-A/2017, the programme strengthens prevention and response to rural fires at the wildland-urban interface.","program.what.title":"What are these Programmes","program.what.p1":"Safe Village focuses on structural measures to protect settlements at the WUI: protection zones, critical points and designated shelter/refuge sites.","program.what.p2":"Safe People focuses on the population: risk-aware behaviour, self-protection measures and evacuation drills with local authorities.","program.objective.title":"Objective","program.objective.text":"Protect people and assets in WUI settlements through protection zones, shelter/refuge sites, public information and preparedness to evacuate or shelter safely.","program.impl.title":"Implementation","program.impl.p0":"Implemented under a protocol between ANEPC, ANMP and ANAFRE at two levels:","program.impl.impl.strategic":"Strategic level (Central Administration/ANEPC): national guidelines, campaigns and alert systems.","program.impl.operational":"Operational level (Municipalities/Parishes): local protective and awareness measures with community engagement.","program.lines.title":"Lines of action","program.lines.l1":"Settlement protection","program.lines.l2":"Risk behaviour prevention","program.lines.l3":"Public awareness and alerts","program.lines.l4":"Evacuation of settlements","program.lines.l5":"Shelter and refuge sites","program.docs.title":"Documents","program.docs.desc":"Support guides and national references.","program.cta.pt":"📘 Support Guide (PT)","program.cta.en":"📎 Support Guide (EN)","program.cta.off":"🌐 Programme (official site)","how.title":"How to get involved in your village","how.step1.t":"1) Get informed","how.step1.d":"Check if your settlement is covered and meet your Local Safety Officer (OSL).","how.step2.t":"2) Contribute","how.step2.d":"Help keep your village data up to date. You can also report issues you find on the ground.","how.step2.cta":"Add information/comment","how.step3.t":"3) Train","how.step3.d":"Join the drills and share self-protection with vulnerable neighbours.","emerg.title":"⚠️ In case of emergency ⚠️","emerg.text":"Call <strong>112</strong> immediately.","footer.copy":"© 2025 Ruben Sousa · All rights reserved"
  }};

  function applyI18n(dict){
    document.querySelectorAll('[data-i18n]').forEach(el=>{
      const k=el.dataset.i18n;
      if(dict[k]!=null) el.innerHTML=dict[k];
    });
    document.documentElement.lang=(dict===fallback.en?'en':'pt');
  }
  async function fetchDict(l){
    try{
      const r=await fetch(`i18n/${l}.json`,{cache:'no-cache'});
      if(!r.ok) throw 0;
      return await r.json();
    }catch(_){ return fallback[l]||fallback.pt; }
  }
  async function setLang(l){
    // Só executa a tradução se existirem elementos para traduzir na página
    if (document.querySelector('[data-i18n]')) {
      const d=await fetchDict(l);
      applyI18n(d);
    }
    localStorage.setItem(LS_KEY,l);
    if (lang1) lang1.value=l;
    if (lang2) lang2.value=l;
  }

  const urlLang=new URLSearchParams(location.search).get('lang');
  const initial=(localStorage.getItem(LS_KEY)||urlLang||'pt').toLowerCase();
  if (lang1) lang1.value=initial;
  if (lang2) lang2.value=initial;
  setLang(initial);
  lang1?.addEventListener('change',e=>setLang(e.target.value));
  lang2?.addEventListener('change',e=>setLang(e.target.value));

  // Initialize auth logic on page load
  document.addEventListener('DOMContentLoaded', handleAuth);

})();
