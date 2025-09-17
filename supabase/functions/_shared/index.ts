// supabase/functions/notify-new-contact/index.ts

// Cabeçalhos CORS para permitir pedidos de qualquer origem (webhooks).
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Define a interface para os dados do contacto
interface Contact {
  id: number;
  created_at: string;
  name: string;
  email: string;
  subject: string;
  phone?: string;
  message: string;
}

console.log("Edge Function 'notify-new-contact' está pronta.");

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Extrair os dados do novo contacto
    const { record: newContact } = await req.json() as { record: Contact };
    console.log(`Novo contacto recebido de: ${newContact.name} (${newContact.email})`);

    // 2. Obter as chaves secretas
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const adminEmail = Deno.env.get('ADMIN_EMAIL'); // O e-mail para onde a notificação será enviada

    if (!resendApiKey) {
      throw new Error("A chave da API do Resend (RESEND_API_KEY) não está configurada.");
    }
    if (!adminEmail) {
      throw new Error("O e-mail do administrador (ADMIN_EMAIL) não está configurado.");
    }
    
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'Aldeias Seguras <onboarding@resend.dev>';

    // 3. Formatar o corpo do e-mail
    const emailHtml = `
      <h1>Novo Contacto Recebido</h1>
      <p>Recebeu uma nova mensagem através do formulário de contacto do site Aldeias Seguras.</p>
      <ul>
        <li><strong>Nome:</strong> ${newContact.name}</li>
        <li><strong>Email:</strong> ${newContact.email}</li>
        <li><strong>Telefone:</strong> ${newContact.phone || 'Não fornecido'}</li>
        <li><strong>Assunto:</strong> ${newContact.subject}</li>
      </ul>
      <hr>
      <p><strong>Mensagem:</strong></p>
      <p style="white-space: pre-wrap;">${newContact.message}</p>
    `;

    // 4. Enviar o e-mail usando Resend
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [adminEmail],
        subject: `Novo Contacto: ${newContact.subject}`,
        html: emailHtml,
      }),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`Falha ao enviar e-mail de notificação: ${errorBody}`);
    }

    console.log(`E-mail de notificação enviado para ${adminEmail}.`);

    return new Response(JSON.stringify({ message: "Notificação enviada com sucesso." }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Erro na função notify-new-contact:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});