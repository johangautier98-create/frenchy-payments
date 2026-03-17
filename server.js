const express = require('express');
function getStripe(){const k=process.env.STRIPE_SECRET_KEY;if(!k)throw new Error('STRIPE_SECRET_KEY manquante');return require('stripe')(k);}
const app = express();

app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const RESEND_API_KEY = process.env.RESEND_API_KEY;

function safe(val) {
  return val === undefined || val === null || val === '' ? 'Non renseigné' : String(val);
}

function money(val) {
  return Number(val || 0).toFixed(2).replace('.', ',') + ' €';
}

function delayLabel(days) {
  const d = parseInt(days || 0);
  if (d === 0) return 'Comptant (paiement immédiat)';
  if (d === 7) return '1 semaine';
  if (d === 14) return '2 semaines';
  if (d === 21) return '3 semaines';
  if (d === 28) return '4 semaines';
  return d + ' jour(s)';
}

function renderItemsTable(items = []) {
  if (!items.length) return '<p style="color:#888;font-style:italic;">Aucun produit transmis.</p>';
  const rows = items.map(item => {
    const title = safe(item.title || item.name);
    const variant = item.variant || item.variant_title || '';
    const qty = Number(item.quantity || 1);
    const unitPrice = Number(item.unit_price || item.price || 0);
    const lineTotal = Number(item.line_price || item.line_total || unitPrice * qty);
    return `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;"><strong>${title}</strong>${variant ? `<br><span style="font-size:12px;color:#888;">${variant}</span>` : ''}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:center;">${qty}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:right;">${money(unitPrice)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:700;color:#c8141e;">${money(lineTotal)}</td>
    </tr>`;
  }).join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;">
    <thead><tr style="background:#f8f8f8;">
      <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e5e5;">Produit</th>
      <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e5e5e5;">Qté</th>
      <th style="padding:10px 12px;text-align:right;border-bottom:2px solid #e5e5e5;">Prix HT</th>
      <th style="padding:10px 12px;text-align:right;border-bottom:2px solid #e5e5e5;">Total HT</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function buildEmailHtml(data) {
  const { payment_mode, captureDate, delay_days, company_name, customer_name, customer_email, phone, order_ref, sample_request, total, items = [] } = data;
  const paymentColor = payment_mode === 'Prélèvement SEPA' ? '#1a6a3a' : '#0050b3';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:30px 0;">
<tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.10);">
  <tr><td style="background:linear-gradient(135deg,#c8141e,#8a0010);padding:28px 32px;">
    <table width="100%"><tr>
      <td><div style="font-size:22px;font-weight:900;color:#fff;letter-spacing:2px;">🎣 FRENCHY LEURRES</div>
      <div style="font-size:13px;color:rgba(255,255,255,.8);margin-top:4px;">Gautier Fishing · Port-de-Bouc</div></td>
      <td align="right"><div style="background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);border-radius:20px;padding:6px 16px;">
        <span style="font-size:11px;color:#fff;letter-spacing:1.5px;text-transform:uppercase;">Nouvelle commande Pro</span>
      </div></td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:28px 32px 0;">
    <table width="100%" style="background:#fafafa;border-radius:12px;border:1px solid #e8e8e8;overflow:hidden;">
      <tr>
        <td style="padding:16px 20px;border-bottom:1px solid #eee;">
          <span style="font-size:11px;color:#888;text-transform:uppercase;">Mode de paiement</span><br>
          <strong style="font-size:15px;color:${paymentColor};">💳 ${safe(payment_mode)}</strong>
        </td>
        <td style="padding:16px 20px;border-bottom:1px solid #eee;border-left:1px solid #eee;">
          <span style="font-size:11px;color:#888;text-transform:uppercase;">Délai choisi</span><br>
          <strong style="font-size:15px;color:#111;">${delayLabel(delay_days)}</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 20px;">
          <span style="font-size:11px;color:#888;text-transform:uppercase;">Référence</span><br>
          <strong style="font-size:15px;color:#111;">${safe(order_ref)}</strong>
        </td>
        <td style="padding:16px 20px;border-left:1px solid #eee;">
          <span style="font-size:11px;color:#888;text-transform:uppercase;">Date prévue</span><br>
          <strong style="font-size:15px;color:#111;">📅 ${safe(captureDate)}</strong>
        </td>
      </tr>
    </table>
  </td></tr>
  <tr><td style="padding:24px 32px 0;">
    <div style="font-size:13px;font-weight:700;color:#c8141e;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;">👤 Client</div>
    <table width="100%" style="background:#fafafa;border-radius:12px;border:1px solid #e8e8e8;">
      <tr><td style="padding:12px 20px;border-bottom:1px solid #eee;width:40%;color:#666;font-size:13px;">Société</td><td style="padding:12px 20px;border-bottom:1px solid #eee;font-size:13px;font-weight:600;">${safe(company_name)}</td></tr>
      <tr><td style="padding:12px 20px;border-bottom:1px solid #eee;color:#666;font-size:13px;">Contact</td><td style="padding:12px 20px;border-bottom:1px solid #eee;font-size:13px;">${safe(customer_name)}</td></tr>
      <tr><td style="padding:12px 20px;border-bottom:1px solid #eee;color:#666;font-size:13px;">Email</td><td style="padding:12px 20px;border-bottom:1px solid #eee;font-size:13px;">${safe(customer_email)}</td></tr>
      <tr><td style="padding:12px 20px;color:#666;font-size:13px;">Téléphone</td><td style="padding:12px 20px;font-size:13px;">${safe(phone)}</td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:24px 32px 0;">
    <div style="font-size:13px;font-weight:700;color:#c8141e;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;">🛒 Produits</div>
    <div style="border:1px solid #e8e8e8;border-radius:12px;overflow:hidden;">${renderItemsTable(items)}</div>
  </td></tr>
  <tr><td style="padding:16px 32px 0;">
    <table width="100%" style="background:#fff8f8;border:1.5px solid rgba(200,20,30,.2);border-radius:12px;">
      <tr>
        <td style="padding:16px 20px;"><span style="font-size:13px;color:#666;">Total HT</span></td>
        <td style="padding:16px 20px;text-align:right;">
          <span style="font-size:24px;font-weight:900;color:#c8141e;">${money(total)}</span>
          <span style="font-size:11px;color:#888;display:block;">Hors Taxes · Art. 293B CGI</span>
        </td>
      </tr>
    </table>
  </td></tr>
  ${sample_request ? `<tr><td style="padding:24px 32px 0;">
    <div style="font-size:13px;font-weight:700;color:#c8141e;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;">📝 Demandes</div>
    <div style="background:#fafafa;border-radius:12px;border:1px solid #e8e8e8;padding:16px 20px;">
      <p style="margin:0;font-size:13px;"><strong>🎁 Échantillons :</strong> ${safe(sample_request)}</p>
    </div>
  </td></tr>` : ''}
  <tr><td style="padding:28px 32px;">
    <div style="border-top:1px solid #eee;padding-top:20px;text-align:center;">
      <p style="margin:0;font-size:11px;color:#aaa;">Frenchy Leurres · Gautier Fishing · Port-de-Bouc<br>Auto-entrepreneur non assujetti à la TVA — Art. 293B du CGI</p>
    </div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

async function sendEmail(data) {
  if (!RESEND_API_KEY) return;
  const company = data.company_name || data.customer_name || 'Client pro';
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'onboarding@resend.dev',
      to: 'gautierfishing@gmail.com',
      subject: `🎣 Nouvelle commande Pro — ${company} — ${safe(data.order_ref)}`,
      html: buildEmailHtml(data)
    })
  });
}

// ── ROUTE : Carte bancaire ──
app.post('/create-payment', async (req, res) => {
  try {
    const { amount, currency, customer_email, customer_name, delay_days, order_ref, company_name, phone, sample_request, total, items } = req.body;
    if (!amount || !customer_email || !customer_name) return res.status(400).json({ error: 'Paramètres manquants' });

    const captureDateObj = new Date();
    captureDateObj.setDate(captureDateObj.getDate() + parseInt(delay_days || 0));
    const captureDate = captureDateObj.toLocaleDateString('fr-FR');

    const customers = await getStripe().customers.list({ email: customer_email, limit: 1 });
    const customer = customers.data.length > 0
      ? customers.data[0]
      : await getStripe().customers.create({ email: customer_email, name: customer_name });

    const paymentIntent = await getStripe().paymentIntents.create({
      amount: Math.round(Number(amount) * 100),
      currency: currency || 'eur',
      customer: customer.id,
      capture_method: 'manual',
      payment_method_types: ['card'],
      metadata: { order_ref: order_ref || '', delay_days: String(delay_days || 0), company_name: company_name || '' }
    });

    sendEmail({ payment_mode: 'Carte bancaire', captureDate, delay_days, company_name, customer_name, customer_email, phone, order_ref, sample_request, total: total || amount, items: items || [] }).catch(console.error);

    res.json({ clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id, captureDate });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── ROUTE : SEPA setup ──
app.post('/create-sepa', async (req, res) => {
  try {
    const { customer_email, customer_name, amount, delay_days, order_ref, company_name, phone, sample_request } = req.body;
    if (!customer_email || !customer_name) return res.status(400).json({ error: 'Paramètres manquants' });

    const customers = await getStripe().customers.list({ email: customer_email, limit: 1 });
    const customer = customers.data.length > 0
      ? customers.data[0]
      : await getStripe().customers.create({ email: customer_email, name: customer_name, metadata: { company_name: company_name || '' } });

    const setupIntent = await getStripe().setupIntents.create({
      customer: customer.id,
      payment_method_types: ['sepa_debit'],
      metadata: { amount: String(amount || ''), delay_days: String(delay_days || ''), order_ref: order_ref || '', company_name: company_name || '', sample_request: sample_request || '' }
    });

    res.json({ clientSecret: setupIntent.client_secret, customerId: customer.id, setupIntentId: setupIntent.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── ROUTE : SEPA confirm ──
app.post('/confirm-sepa', async (req, res) => {
  try {
    const { setupIntentId, customerId, amount, delay_days, order_ref, company_name, customer_name, customer_email, phone, sample_request, total, items } = req.body;
    if (!setupIntentId || !customerId || !amount) return res.status(400).json({ error: 'Paramètres manquants' });

    const setupIntent = await getStripe().setupIntents.retrieve(setupIntentId);
    if (!setupIntent.payment_method) return res.status(400).json({ error: 'Aucun RIB trouvé' });

    const captureDateObj = new Date();
    captureDateObj.setDate(captureDateObj.getDate() + parseInt(delay_days || 0));
    const captureDate = captureDateObj.toLocaleDateString('fr-FR');

    const paymentIntent = await getStripe().paymentIntents.create({
      amount: Math.round(Number(amount) * 100),
      currency: 'eur',
      customer: customerId,
      payment_method: setupIntent.payment_method,
      payment_method_types: ['sepa_debit'],
      confirm: true,
      metadata: { order_ref: order_ref || '', delay_days: String(delay_days || 0), company_name: company_name || '' }
    });

    sendEmail({ payment_mode: 'Prélèvement SEPA', captureDate, delay_days, company_name, customer_name, customer_email, phone, order_ref, sample_request, total: total || amount, items: items || [] }).catch(console.error);

    res.json({ success: true, paymentIntentId: paymentIntent.id, captureDate });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => res.json({ status: 'Frenchy Leurres API OK' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
