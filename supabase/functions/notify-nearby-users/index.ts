// Importa as ferramentas necessárias
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Cabeçalhos CORS para permitir pedidos de qualquer origem (webhooks).
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
// Define como são os dados de um "Relato" e de um "Perfil" para o código ser mais seguro
interface Relato {
  id: string; // O ID é um UUID, que em JS/TS é tratado como string
  lat: number;
  lng: number;
  // Pode adicionar aqui outros campos do relato que queira usar no e-mail
}

interface Profile {
  id: string;
  email: string;
  full_name: string;
}

console.log("Edge Function 'notify-nearby-users' está pronta.");

// Esta é a função principal que é executada quando o nosso "assistente" é chamado
Deno.serve(async (req) => {
  // O método OPTIONS é uma verificação de segurança que os navegadores fazem. É boa prática responder-lhe.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Extrair os dados do novo relato de incêndio que vêm do "sinal"
    const { record: newRelato } = await req.json() as { record: Relato };
    console.log(`Novo relato de incêndio recebido: ID ${newRelato.id} em (${newRelato.lat}, ${newRelato.lng})`);

    // Verificação de segurança: garantir que temos os dados necessários
    if (!newRelato || typeof newRelato.lat !== 'number' || typeof newRelato.lng !== 'number') {
      throw new Error("Dados do relato inválidos ou em falta (lat/lng).");
    }

    // 2. Definir o raio de notificação em metros (aqui estão 10 km)
    const NOTIFICATION_RADIUS_METERS = 10000;

    // 3. Criar uma ligação à base de dados com permissões de administrador.
    // Isto é seguro porque corre no servidor e permite-nos procurar em todos os perfis.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 4. Chamar uma função especial na base de dados para encontrar utilizadores próximos.
    // Esta é a forma mais rápida e eficiente de fazer esta pesquisa.
    console.log(`A procurar utilizadores num raio de ${NOTIFICATION_RADIUS_METERS} metros...`);
    const { data: nearbyUsers, error: rpcError } = await supabaseAdmin.rpc('get_users_in_radius', {
      p_lng: newRelato.lng,
      p_lat: newRelato.lat,
      p_radius: NOTIFICATION_RADIUS_METERS
    });

    if (rpcError) {
      throw new Error(`Erro na Base de Dados: ${rpcError.message}`);
    }

    if (!nearbyUsers || nearbyUsers.length === 0) {
      console.log("Nenhum utilizador encontrado no raio de notificação.");
      return new Response(JSON.stringify({ message: "Nenhum utilizador para notificar." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    console.log(`Encontrados ${nearbyUsers.length} utilizadores para notificar.`);

    // 5. Enviar um e-mail a cada utilizador encontrado.
    // Vamos usar um serviço chamado Resend, cuja chave secreta vamos configurar a seguir.
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      throw new Error("A chave da API do Resend não está configurada.");
    }

    // Usa um e-mail de remetente configurável, com fallback para o de teste do Resend.
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'Aldeias Seguras <onboarding@resend.dev>';

    // Para otimizar, enviamos todos os e-mails em paralelo em vez de um a um.
    const emailPromises = (nearbyUsers as Profile[]).map(user => {
        // Constrói um link dinâmico para o mapa, usando uma variável de ambiente.
        // Isto permite mudar facilmente de 'github.io' para um domínio personalizado.
        const siteBaseUrl = Deno.env.get('SITE_BASE_URL') || 'https://rubensousa100.github.io/Aldeias-Seguras-Site';
        const mapUrl = `${siteBaseUrl}/Incendio.html?lat=${newRelato.lat}&lng=${newRelato.lng}&zoom=13#ffr-map-collab`;

        // Construir o corpo do e-mail em HTML
        const emailHtml = `
          <h1>🔥 Alerta de Incêndio Próximo</h1>
          <p>Olá ${user.full_name || 'utilizador'},</p>
          <p>Foi registado um novo alerta de incêndio perto da sua localização guardada.</p>
          <p><strong>Localização do Alerta:</strong> Latitude ${newRelato.lat.toFixed(4)}, Longitude ${newRelato.lng.toFixed(4)}</p>
          <p>Por favor, mantenha-se atento aos canais oficiais da Proteção Civil e tome as devidas precauções.</p>
          <p>Para mais detalhes, visite o nosso mapa colaborativo:</p>
          <a href="${mapUrl}">Ver Mapa de Alertas</a>
          <hr>
          <p><small>Recebeu este e-mail porque a sua localização está na área de notificação. Pode gerir as suas preferências no seu perfil.</small></p>
        `;

        // Enviar o e-mail através da API do Resend
        return fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [user.email],
            subject: '🔥 Alerta de Incêndio na Sua Área',
            html: emailHtml,
          }),
        });
    });
    
    // Usamos Promise.allSettled para esperar que todos os envios terminem, quer tenham sucesso ou falhem.
    const results = await Promise.allSettled(emailPromises);
    let successfulSends = 0;
    results.forEach((result, index) => {
      const userEmail = (nearbyUsers as Profile[])[index].email;
      if (result.status === 'fulfilled' && result.value.ok) {
        successfulSends++;
      } else if (result.status === 'fulfilled' && !result.value.ok) {
        // A API do Resend respondeu com um erro (ex: 4xx, 5xx)
        result.value.text().then(text => {
          console.error(`Falha ao enviar e-mail para ${userEmail}: Status ${result.value.status} - ${text}`);
        });
      } else {
        // O próprio pedido fetch() falhou (ex: erro de rede)
        console.error(`Erro de rede ao tentar enviar e-mail para ${userEmail}:`, result.reason.message);
      }
    });

    console.log(`${successfulSends} de ${nearbyUsers.length} e-mails enviados com sucesso.`);

    // Retornamos uma resposta 200 OK porque o processo de tentativa de envio terminou.
    return new Response(JSON.stringify({ message: `Tentativa de notificação para ${nearbyUsers.length} utilizadores concluída. ${successfulSends} enviados com sucesso.` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200, // OK
    });

  } catch (error) {
    console.error('Erro na função:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
