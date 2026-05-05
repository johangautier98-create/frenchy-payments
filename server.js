console.log('======== TEST JOHAN FINAL ========');
console.log('CODE UPDATED OK');
 
const express = require('express');
const Stripe = require('stripe');
const { Pool } = require('pg');
 
console.log('======== TEST JOHAN V5 ========');
console.log('START FILE OK');
console.log('ENV DATABASE RAW =', !!process.env.DATABASE_URL);
 
const app = express();
 
const PORT = process.env.PORT || 3000;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const CRON_SECRET = process.env.CRON_SECRET || '';
const DATABASE_URL = process.env.DATABASE_URL || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';
const TO_EMAIL = process.env.TO_EMAIL || 'gautierfishing@gmail.com';
const LOGO_URL = 'https://cdn.shopify.com/s/files/1/0831/2157/0124/files/Image13251.jpg?v=1773837209';
 
console.log('ENV CHECK =>', {
  STRIPE_SECRET_KEY_present: !!STRIPE_SECRET_KEY,
  STRIPE_SECRET_KEY_length: STRIPE_SECRET_KEY.length,
  RESEND_API_KEY_present: !!RESEND_API_KEY,
  DATABASE_URL_present: !!DATABASE_URL,
  CRON_SECRET_present: !!CRON_SECRET,
  FROM_EMAIL_present: !!FROM_EMAIL,
  TO_EMAIL_present: !!TO_EMAIL
});
 
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : null;
 
app.use(express.json({ limit: '1mb' }));
 
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-cron-secret');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
 
function safe(val) {
  return val === undefined || val === null || val === '' ? 'Non renseigné' : String(val);
}
 
function money(val) {
  return Number(val || 0).toFixed(2).replace('.', ',') + ' €';
}
 
function parseDays(days) {
  const d = parseInt(days || 0, 10);
  return [0, 7, 14, 21, 28].includes(d) ? d : 0;
}
 
function delayLabel(days) {
  const d = parseDays(days);
  if (d === 0) return 'Comptant';
  if (d === 7) return '1 semaine';
  if (d === 14) return '2 semaines';
  if (d === 21) return '3 semaines';
  if (d === 28) return '4 semaines';
  return `${d} jour(s)`;
}
 
function addDays(baseDate, days) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + parseDays(days));
  return d;
}
 
function formatDateFR(dateInput) {
  const d = new Date(dateInput);
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
}
 
function amountToCents(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error('Montant invalide');
  }
  return Math.round(n * 100);
}
 
function validateEmail(email) {
  return typeof email === 'string' && email.includes('@') && email.length >= 5;
}
 
function shortProductName(title) {
  if (!title) return 'Non renseigné';
  const parts = String(title).split('|');
  return parts[0].trim();
}
 
function renderItemsTable(items = []) {
  if (!Array.isArray(items) || !items.length) {
    return '<p style="color:#888;font-style:italic;">Aucun produit transmis.</p>';
  }

  const rows = items.map((item, i) => {
    const name     = item.title || item.name || 'Non renseigné';
    const coloris  = item.coloris  || (item.variant ? item.variant.split(' / ')[0] : '') || '—';
    const longueur = item.longueur || (item.variant ? item.variant.split(' / ')[1] : '') || '—';
    const grammage = item.grammage || (item.variant ? item.variant.split(' / ')[2] : '') || '—';
    const ref      = item.ref || item.sku || '—';
    const qty      = Number(item.quantity || 1);
    const unitPrice= Number(item.unit_price || item.price || 0);
    const lineTotal= Number(item.line_price || item.line_total || unitPrice * qty);
    const bg       = i % 2 === 0 ? '#ffffff' : '#f9f9f9';

    return `<tr style="background:${bg};">
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-weight:600;font-size:13px;">${safe(name)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#555;">${safe(coloris)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#555;">${safe(longueur)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#555;">${safe(grammage)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:11px;color:#1a6a3a;font-weight:600;white-space:nowrap;">${safe(ref)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:13px;">${qty}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px;">${money(unitPrice)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:700;color:#c8141e;font-size:13px;">${money(lineTotal)}</td>
    </tr>`;
  }).join('');

  return `<table style="width:100%;border-collapse:collapse;font-size:14px;">
    <thead><tr style="background:#f5f5f5;">
      <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e5e5;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.5px;">Produit</th>
      <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e5e5;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.5px;">Coloris</th>
      <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e5e5;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.5px;">Taille</th>
      <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e5e5;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.5px;">Grammage</th>
      <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e5e5;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.5px;">Référence</th>
      <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e5e5e5;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.5px;">Qté</th>
      <th style="padding:10px 12px;text-align:right;border-bottom:2px solid #e5e5e5;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.5px;">Prix HT</th>
      <th style="padding:10px 12px;text-align:right;border-bottom:2px solid #e5e5e5;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.5px;">Total HT</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}
 
function buildEmailHeader(title) {
  return `
  <tr><td style="background:#ffffff;padding:20px 28px;border-bottom:2px solid #c8141e;border-radius:16px 16px 0 0;">
    <table width="100%"><tr>
      <td style="vertical-align:middle;">
        <table><tr>
          <td style="vertical-align:middle;padding-right:14px;">
            <img src="${LOGO_URL}" alt="Gautier Fishing" style="width:64px;height:64px;border-radius:50%;object-fit:cover;display:block;">
          </td>
          <td style="vertical-align:middle;">
            <div style="font-size:20px;font-weight:900;color:#1a1a1a;letter-spacing:2px;">FRENCHY LEURRES</div>
            <div style="font-size:12px;color:#888;margin-top:2px;">Gautier Fishing · Port-de-Bouc</div>
          </td>
        </tr></table>
      </td>
      <td align="right" style="vertical-align:middle;">
        <div style="background:#f2f2f2;border:1px solid #ddd;border-radius:20px;padding:6px 16px;display:inline-block;">
          <span style="font-size:11px;color:#444;letter-spacing:1.5px;text-transform:uppercase;">${safe(title)}</span>
        </div>
      </td>
    </tr></table>
  </td></tr>`;
}
 
function buildEmailHtml(data) {
  const {
    title,
    payment_mode,
    captureDate,
    delay_days,
    company_name,
    shop_name,
    customer_name,
    customer_email,
    phone,
    order_ref,
    sample_request,
    total,
    items = [],
    extra_lines = []
  } = data;
 
  const paymentColor = payment_mode === 'Prélèvement SEPA' ? '#1a6a3a' : '#0050b3';
 
  const extraHtml = Array.isArray(extra_lines) && extra_lines.length
    ? `<div style="background:#fafafa;border-radius:10px;border:1px solid #e8e8e8;padding:14px 18px;margin-top:14px;">
        ${extra_lines.map(line => `<p style="margin:0 0 6px;font-size:13px;color:#555;">${line}</p>`).join('')}
      </div>`
    : '';
 
  const societyHtml = shop_name
    ? `<div style="font-weight:600;font-size:14px;color:#111;">${safe(company_name)}</div>
       <div style="font-size:12px;color:#888;margin-top:2px;">${safe(shop_name)}</div>`
    : `<div style="font-weight:600;font-size:14px;color:#111;">${safe(company_name)}</div>`;
 
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:30px 0;">
<tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.10);">
 
  ${buildEmailHeader(title)}
 
  <tr><td style="padding:24px 28px 0;">
    <table width="100%" style="background:#fafafa;border-radius:10px;border:1px solid #e8e8e8;overflow:hidden;">
      <tr>
        <td style="padding:14px 18px;border-bottom:1px solid #eee;">
          <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;">Mode de paiement</span><br>
          <strong style="font-size:15px;color:${paymentColor};">${safe(payment_mode)}</strong>
        </td>
        <td style="padding:14px 18px;border-bottom:1px solid #eee;border-left:1px solid #eee;">
          <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;">Délai choisi</span><br>
          <strong style="font-size:15px;color:#111;">${delayLabel(delay_days)}</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 18px;">
          <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;">Référence commande</span><br>
          <strong style="font-size:15px;color:#111;">${safe(order_ref)}</strong>
        </td>
        <td style="padding:14px 18px;border-left:1px solid #eee;">
          <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;">Date prévue</span><br>
          <strong style="font-size:15px;color:#111;">${safe(captureDate)}</strong>
        </td>
      </tr>
    </table>
    ${extraHtml}
  </td></tr>
 
  <tr><td style="padding:22px 28px 0;">
    <div style="font-size:11px;font-weight:700;color:#c8141e;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:10px;">👤 Client</div>
    <table width="100%" style="background:#fafafa;border-radius:10px;border:1px solid #e8e8e8;border-collapse:collapse;">
      <tr>
        <td style="padding:10px 18px;border-bottom:1px solid #eee;width:38%;color:#888;font-size:13px;vertical-align:top;">Société / Magasin</td>
        <td style="padding:10px 18px;border-bottom:1px solid #eee;font-size:13px;">${societyHtml}</td>
      </tr>
      <tr><td style="padding:10px 18px;border-bottom:1px solid #eee;color:#888;font-size:13px;">Contact</td><td style="padding:10px 18px;border-bottom:1px solid #eee;font-size:13px;">${safe(customer_name)}</td></tr>
      <tr><td style="padding:10px 18px;border-bottom:1px solid #eee;color:#888;font-size:13px;">Email</td><td style="padding:10px 18px;border-bottom:1px solid #eee;font-size:13px;color:#1a6a3a;">${safe(customer_email)}</td></tr>
      <tr><td style="padding:10px 18px;color:#888;font-size:13px;">Téléphone</td><td style="padding:10px 18px;font-size:13px;">${safe(phone)}</td></tr>
    </table>
  </td></tr>
 
  <tr><td style="padding:22px 28px 0;">
    <div style="font-size:11px;font-weight:700;color:#c8141e;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:10px;">🛒 Produits</div>
    <div style="border:1px solid #e8e8e8;border-radius:10px;overflow:hidden;">${renderItemsTable(items)}</div>
  </td></tr>
 
  <tr><td style="padding:16px 28px 0;">
    <table width="100%" style="background:#fff8f8;border:1.5px solid rgba(200,20,30,.2);border-radius:10px;">
      <tr>
        <td style="padding:14px 18px;"><span style="font-size:13px;color:#666;">Total HT</span></td>
        <td style="padding:14px 18px;text-align:right;">
          <span style="font-size:26px;font-weight:900;color:#c8141e;">${money(total)}</span>
          <span style="font-size:11px;color:#888;display:block;">Hors Taxes · Art. 293B CGI</span>
        </td>
      </tr>
    </table>
  </td></tr>
 
  ${sample_request ? `<tr><td style="padding:22px 28px 0;">
    <div style="font-size:11px;font-weight:700;color:#c8141e;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:10px;">📝 Demandes</div>
    <div style="background:#fafafa;border-radius:10px;border:1px solid #e8e8e8;padding:14px 18px;">
      <p style="margin:0;font-size:13px;"><strong>🎁 Échantillons :</strong> ${safe(sample_request)}</p>
    </div>
  </td></tr>` : ''}
 
  <tr><td style="padding:24px 28px;">
    <div style="border-top:1px solid #eee;padding-top:18px;text-align:center;">
      <p style="margin:0;font-size:11px;color:#bbb;">Frenchy Leurres · Gautier Fishing · Port-de-Bouc<br>Auto-entrepreneur non assujetti à la TVA — Art. 293B du CGI</p>
    </div>
  </td></tr>
 
</table>
</td></tr></table>
</body></html>`;
}
 
function buildClientEmailHtml(data) {
  const {
    payment_mode,
    captureDate,
    delay_days,
    company_name,
    shop_name,
    customer_name,
    order_ref,
    total,
    items = []
  } = data;
 
  const paymentColor = payment_mode === 'Prélèvement SEPA' ? '#1a6a3a' : '#0050b3';
 
  const delayMsg = parseDays(delay_days) === 0
    ? 'Votre paiement a été traité immédiatement.'
    : `Votre paiement de <strong>${money(total)}</strong> sera prélevé le <strong>${safe(captureDate)}</strong>.`;
 
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:30px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.10);">
 
  <tr><td style="background:#ffffff;padding:20px 28px;border-bottom:2px solid #c8141e;border-radius:16px 16px 0 0;">
    <table width="100%"><tr>
      <td style="vertical-align:middle;">
        <table><tr>
          <td style="vertical-align:middle;padding-right:14px;">
            <img src="${LOGO_URL}" alt="Gautier Fishing" style="width:56px;height:56px;border-radius:50%;object-fit:cover;display:block;">
          </td>
          <td style="vertical-align:middle;">
            <div style="font-size:18px;font-weight:900;color:#1a1a1a;letter-spacing:2px;">FRENCHY LEURRES</div>
            <div style="font-size:11px;color:#888;margin-top:2px;">Gautier Fishing · Port-de-Bouc</div>
          </td>
        </tr></table>
      </td>
      <td align="right" style="vertical-align:middle;">
        <div style="background:#f2f2f2;border:1px solid #ddd;border-radius:20px;padding:5px 14px;display:inline-block;">
          <span style="font-size:11px;color:#444;letter-spacing:1.5px;text-transform:uppercase;">Confirmation de commande</span>
        </div>
      </td>
    </tr></table>
  </td></tr>
 
  <tr><td style="padding:28px;">
    <p style="font-size:15px;color:#333;margin:0 0 6px;">Bonjour <strong>${safe(customer_name)}</strong>,</p>
    <p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 20px;">Merci pour votre commande ! Nous avons bien reçu votre demande et elle est en cours de traitement.</p>
 
    <table width="100%" style="background:#fafafa;border-radius:10px;border:1px solid #e8e8e8;border-collapse:collapse;margin-bottom:20px;">
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #eee;">
          <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;">Référence commande</span><br>
          <strong style="font-size:15px;color:#111;">${safe(order_ref)}</strong>
        </td>
        <td style="padding:12px 16px;border-bottom:1px solid #eee;border-left:1px solid #eee;">
          <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;">Mode de paiement</span><br>
          <strong style="font-size:15px;color:${paymentColor};">${safe(payment_mode)}</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 16px;" colspan="2">
          <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;">Prélèvement</span><br>
          <span style="font-size:14px;color:#333;">${delayMsg}</span>
        </td>
      </tr>
    </table>
 
    <div style="font-size:11px;font-weight:700;color:#c8141e;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:10px;">🛒 Récapitulatif de votre commande</div>
    <div style="border:1px solid #e8e8e8;border-radius:10px;overflow:hidden;margin-bottom:16px;">${renderItemsTable(items)}</div>
 
    <table width="100%" style="background:#fff8f8;border:1.5px solid rgba(200,20,30,.2);border-radius:10px;margin-bottom:24px;">
      <tr>
        <td style="padding:14px 18px;"><span style="font-size:13px;color:#666;">Total HT</span></td>
        <td style="padding:14px 18px;text-align:right;">
          <span style="font-size:24px;font-weight:900;color:#c8141e;">${money(total)}</span>
          <span style="font-size:11px;color:#888;display:block;">Hors Taxes · Art. 293B CGI</span>
        </td>
      </tr>
    </table>
 
    <div style="background:#f0f9f4;border:1px solid rgba(26,138,90,.2);border-radius:10px;padding:14px 18px;margin-bottom:20px;">
      <p style="margin:0;font-size:13px;color:#1a6a3a;line-height:1.7;">
        📦 Votre commande sera préparée et expédiée dans les meilleurs délais.<br>
        Pour toute question, contactez-nous à <a href="mailto:gautierfishing@gmail.com" style="color:#1a6a3a;">gautierfishing@gmail.com</a>
      </p>
    </div>
 
    <p style="font-size:14px;color:#555;line-height:1.7;margin:0;">Merci pour votre confiance,<br><strong>L'équipe Frenchy Leurres</strong></p>
  </td></tr>
 
  <tr><td style="padding:0 28px 24px;">
    <div style="border-top:1px solid #eee;padding-top:16px;text-align:center;">
      <p style="margin:0;font-size:11px;color:#bbb;">Frenchy Leurres · Gautier Fishing · Port-de-Bouc<br>Auto-entrepreneur non assujetti à la TVA — Art. 293B du CGI</p>
    </div>
  </td></tr>
 
</table>
</td></tr></table>
</body></html>`;
}
 
async function sendEmail(payload) {
  if (!RESEND_API_KEY) return;
 
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: TO_EMAIL,
      subject: payload.subject,
      html: buildEmailHtml(payload.htmlData)
    })
  });
 
  if (!res.ok) {
    const txt = await res.text();
    console.error('Resend error (admin):', txt);
  }
}
 
async function sendClientEmail(payload) {
  if (!RESEND_API_KEY || !payload.to) return;
 
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: payload.to,
      subject: payload.subject,
      html: buildClientEmailHtml(payload.htmlData)
    })
  });
 
  if (!res.ok) {
    const txt = await res.text();
    console.error('Resend error (client):', txt);
  }
}
 
async function ensureDb() {
  if (!pool) {
    console.log('DB init skipped: DATABASE_URL absente');
    return;
  }
 
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scheduled_payments (
      id BIGSERIAL PRIMARY KEY,
      order_ref TEXT NOT NULL,
      payment_mode TEXT NOT NULL,
      delay_days INTEGER NOT NULL DEFAULT 0,
      due_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled',
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'eur',
      company_name TEXT,
      customer_name TEXT,
      customer_email TEXT,
      phone TEXT,
      sample_request TEXT,
      total NUMERIC(12,2),
      items_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      stripe_customer_id TEXT,
      stripe_payment_intent_id TEXT,
      stripe_setup_intent_id TEXT,
      stripe_payment_method_id TEXT,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
 
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_scheduled_payments_due
    ON scheduled_payments (status, due_at);
  `);
}
 
function validateCommonBody(body) {
  const amount = Number(body.amount);
  const customer_email = body.customer_email;
  const customer_name = body.customer_name;
  const delay_days = parseDays(body.delay_days);
  const order_ref = safe(body.order_ref);
  const company_name = safe(body.company_name);
  const shop_name = body.shop_name || '';
  const phone = body.phone || '';
  const sample_request = body.sample_request || '';
  const total = Number(body.total || amount || 0);
  const items = Array.isArray(body.items) ? body.items : [];
  const currency = (body.currency || 'eur').toLowerCase();
 
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Montant invalide');
  if (!validateEmail(customer_email)) throw new Error('Email invalide');
  if (!customer_name || String(customer_name).trim().length < 2) throw new Error('Nom client invalide');
 
  return { amount, customer_email, customer_name, delay_days, order_ref, company_name, shop_name, phone, sample_request, total, items, currency };
}
 
async function getOrCreateCustomer(email, name, companyName = '') {
  if (!stripe) throw new Error('STRIPE_SECRET_KEY absente côté serveur');
  const customers = await stripe.customers.list({ email, limit: 1 });
  if (customers.data.length > 0) return customers.data[0];
  return stripe.customers.create({ email, name, metadata: { company_name: companyName || '' } });
}
 
async function insertScheduledPayment(data) {
  if (!pool) throw new Error('DATABASE_URL absente côté serveur');
 
  const q = `
    INSERT INTO scheduled_payments (
      order_ref, payment_mode, delay_days, due_at, status,
      amount_cents, currency, company_name, customer_name, customer_email,
      phone, sample_request, total, items_json,
      stripe_customer_id, stripe_payment_intent_id, stripe_setup_intent_id, stripe_payment_method_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    RETURNING id
  `;
  const values = [
    data.order_ref, data.payment_mode, data.delay_days, data.due_at, data.status,
    data.amount_cents, data.currency, data.company_name, data.customer_name, data.customer_email,
    data.phone, data.sample_request, data.total, JSON.stringify(data.items_json || []),
    data.stripe_customer_id || null, data.stripe_payment_intent_id || null,
    data.stripe_setup_intent_id || null, data.stripe_payment_method_id || null
  ];
 
  const result = await pool.query(q, values);
  return result.rows[0].id;
}
 
async function markPaymentStatus(id, status, lastError = null, extra = {}) {
  if (!pool) throw new Error('DATABASE_URL absente côté serveur');
 
  const fields = ['status = $2', 'last_error = $3', 'updated_at = NOW()'];
  const values = [id, status, lastError];
 
  if (extra.stripe_payment_intent_id !== undefined) {
    fields.push(`stripe_payment_intent_id = $${values.length + 1}`);
    values.push(extra.stripe_payment_intent_id);
  }
 
  await pool.query(`UPDATE scheduled_payments SET ${fields.join(', ')} WHERE id = $1`, values);
}
 
app.get('/', (req, res) => {
  res.json({ status: 'Frenchy Leurres API OK', stripeConfigured: !!stripe, dbConfigured: !!pool });
});
 
app.get('/health', async (req, res) => {
  try {
    if (!pool) return res.status(500).json({ ok: false, error: 'DATABASE_URL absente' });
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════
// BON DE COMMANDE PRO (sans paiement Stripe)
// ═══════════════════════════════════════════
app.post('/order-pro', async (req, res) => {
  try {
    const {
      order_ref,
      customer_name,
      customer_email,
      company_name,
      phone,
      total,
      shipping,
      shipping_label,
      sample_request,
      items = []
    } = req.body;

    if (!order_ref || !customer_email || !customer_name) {
      return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }
    if (!validateEmail(customer_email)) {
      return res.status(400).json({ error: 'Email invalide' });
    }

    const portAmt   = Number(shipping  || 0);
    const subTotal  = Number(total     || 0);
    const grandTotal = subTotal + portAmt;
    const portLabel  = portAmt === 0 ? 'Franco de port (offert)' : (shipping_label || money(portAmt));
    const now        = formatDateFR(new Date());
    const amountCents = Math.round(grandTotal * 100);

    // ── INSERT en base pour que l'espace pro puisse afficher la commande ──
    if (pool) {
      await pool.query(`
        INSERT INTO scheduled_payments (
          order_ref, payment_mode, delay_days, due_at, status,
          amount_cents, currency, company_name, customer_name, customer_email,
          phone, sample_request, total, items_json
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      `, [
        order_ref,
        'bon_de_commande',
        0,
        new Date().toISOString(),
        'pending',
        amountCents,
        'eur',
        company_name || '',
        customer_name,
        customer_email,
        phone || '',
        sample_request || '',
        grandTotal,
        JSON.stringify(items)
      ]);
    }

    // ── Email admin ──
    const extra_lines = [
      `📅 Date de réception : ${now}`,
      `🚚 Frais de port : ${portLabel}`,
      `💰 Total HT (port inclus) : ${money(grandTotal)}`,
      `⚠️ Commande à traiter manuellement — aucun paiement Stripe encaissé.`
    ];

    await sendEmail({
      subject: `📋 Bon de commande PRO — ${safe(company_name)} — ${safe(order_ref)}`,
      htmlData: {
        title: 'Bon de commande Pro',
        payment_mode: 'Bon de commande (paiement différé)',
        captureDate: 'À définir',
        delay_days: 0,
        company_name,
        shop_name: '',
        customer_name,
        customer_email,
        phone,
        order_ref,
        sample_request,
        total: grandTotal,
        items,
        extra_lines
      }
    });

    console.log(`[order-pro] OK — ${order_ref} — ${company_name}`);
    res.json({ success: true });

  } catch (err) {
    console.error('order-pro error', err);
    res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
});
ensureDb()
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('DB init error', err);
    app.listen(PORT, () => console.log(`Server running on port ${PORT} (with DB init error)`));
  });
