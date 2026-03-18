const express = require('express');
const Stripe = require('stripe');
const { Pool } = require('pg');

const app = express();

const PORT = process.env.PORT || 3000;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const CRON_SECRET = process.env.CRON_SECRET || '';

// --- MODIFICATION ICI ---
// Remplace le texte entre les guillemets par ton lien PostgreSQL de Railway
const DATABASE_URL = process.env.DATABASE_URL; 
// -------------------------

const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';
const TO_EMAIL = process.env.TO_EMAIL || 'gautierfishing@gmail.com';

console.log('ENV CHECK =>', {
  STRIPE_SECRET_KEY_present: !!STRIPE_SECRET_KEY,
  STRIPE_SECRET_KEY_length: STRIPE_SECRET_KEY.length,
  RESEND_API_KEY_present: !!RESEND_API_KEY,
  DATABASE_URL_present: !!DATABASE_URL, // Doit afficher TRUE dans les logs
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

// Fonctions utilitaires
function safe(val) { return val === undefined || val === null || val === '' ? 'Non renseigné' : String(val); }
function money(val) { return Number(val || 0).toFixed(2).replace('.', ',') + ' €'; }
function parseDays(days) { const d = parseInt(days || 0, 10); return [0, 7, 14, 21, 28].includes(d) ? d : 0; }
function delayLabel(days) {
  const d = parseDays(days);
  if (d === 0) return 'Comptant';
  if (d === 7) return '1 semaine';
  if (d === 14) return '2 semaines';
  if (d === 21) return '3 semaines';
  if (d === 28) return '4 semaines';
  return `${d} jour(s)`;
}
function addDays(baseDate, days) { const d = new Date(baseDate); d.setDate(d.getDate() + parseDays(days)); return d; }
function formatDateFR(dateInput) { const d = new Date(dateInput); return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }); }
function amountToCents(amount) { const n = Number(amount); if (!Number.isFinite(n) || n <= 0) throw new Error('Montant invalide'); return Math.round(n * 100); }
function validateEmail(email) { return typeof email === 'string' && email.includes('@') && email.length >= 5; }

function renderItemsTable(items = []) {
  if (!Array.isArray(items) || !items.length) return '<p style="color:#888;font-style:italic;">Aucun produit transmis.</p>';
  const rows = items.map((item) => {
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
  const { title, payment_mode, captureDate, delay_days, company_name, customer_name, customer_email, phone, order_ref, sample_request, total, items = [], extra_lines = [] } = data;
  const paymentColor = payment_mode === 'Prélèvement SEPA' ? '#1a6a3a' : '#0050b3';
  const extraHtml = Array.isArray(extra_lines) && extra_lines.length ? `<div style="background:#fafafa;border-radius:12px;border:1px solid #e8e8e8;padding:16px 20px;margin-top:16px;">${extra_lines.map(line => `<p style="margin:0 0 8px;font-size:13px;color:#333;">${line}</p>`).join('')}</div>` : '';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:30px 0;"><tr><td align="center"><table width="640" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.10);"><tr><td style="background:linear-gradient(135deg,#c8141e,#8a0010);padding:28px 32px;"><table width="100%"><tr><td><div style="font-size:22px;font-weight:900;color:#fff;letter-spacing:2px;">🎣 FRENCHY LEURRES</div><div style="font-size:13px;color:rgba(255,255,255,.8);margin-top:4px;">Gautier Fishing · Port-de-Bouc</div></td><td align="right"><div style="background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);border-radius:20px;padding:6px 16px;"><span style="font-size:11px;color:#fff;letter-spacing:1.5px;text-transform:uppercase;">${safe(title)}</span></div></td></tr></table></td></tr><tr><td style="padding:28px 32px 0;"><table width="100%" style="background:#fafafa;border-radius:12px;border:1px solid #e8e8e8;overflow:hidden;"><tr><td style="padding:16px 20px;border-bottom:1px solid #eee;"><span style="font-size:11px;color:#888;text-transform:uppercase;">Mode de paiement</span><br><strong style="font-size:15px;color:${paymentColor};">${safe(payment_mode)}</strong></td><td style="padding:16px 20px;border-bottom:1px solid #eee;border-left:1px solid #eee;"><span style="font-size:11px;color:#888;text-transform:uppercase;">Délai choisi</span><br><strong style="font-size:15px;color:#111;">${delayLabel(delay_days)}</strong></td></tr><tr><td style="padding:16px 20px;"><span style="font-size:11px;color:#888;text-transform:uppercase;">Référence</span><br><strong style="font-size:15px;color:#111;">${safe(order_ref)}</strong></td><td style="padding:16px 20px;border-left:1px solid #eee;"><span style="font-size:11px;color:#888;text-transform:uppercase;">Date prévue</span><br><strong style="font-size:15px;color:#111;">${safe(captureDate)}</strong></td></tr></table>${extraHtml}</td></tr><tr><td style="padding:24px 32px 0;"><div style="font-size:13px;font-weight:700;color:#c8141e;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;">👤 Client</div><table width="100%" style="background:#fafafa;border-radius:12px;border:1px solid #e8e8e8;"><tr><td style="padding:12px 20px;border-bottom:1px solid #eee;width:40%;color:#666;font-size:13px;">Société</td><td style="padding:12px 20px;border-bottom:1px solid #eee;font-size:13px;font-weight:600;">${safe(company_name)}</td></tr><tr><td style="padding:12px 20px;border-bottom:1px solid #eee;color:#666;font-size:13px;">Contact</td><td style="padding:12px 20px;border-bottom:1px solid #eee;font-size:13px;">${safe(customer_name)}</td></tr><tr><td style="padding:12px 20px;border-bottom:1px solid #eee;color:#666;font-size:13px;">Email</td><td style="padding:12px 20px;border-bottom:1px solid #eee;font-size:13px;">${safe(customer_email)}</td></tr><tr><td style="padding:12px 20px;color:#666;font-size:13px;">Téléphone</td><td style="padding:12px 20px;font-size:13px;">${safe(phone)}</td></tr></table></td></tr><tr><td style="padding:24px 32px 0;"><div style="font-size:13px;font-weight:700;color:#c8141e;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;">🛒 Produits</div><div style="border:1px solid #e8e8e8;border-radius:12px;overflow:hidden;">${renderItemsTable(items)}</div></td></tr><tr><td style="padding:16px 32px 0;"><table width="100%" style="background:#fff8f8;border:1.5px solid rgba(200,20,30,.2);border-radius:12px;"><tr><td style="padding:16px 20px;"><span style="font-size:13px;color:#666;">Total HT</span></td><td style="padding:16px 20px;text-align:right;"><span style="font-size:24px;font-weight:900;color:#c8141e;">${money(total)}</span><span style="font-size:11px;color:#888;display:block;">Hors Taxes · Art. 293B CGI</span></td></tr></table></td></tr>${sample_request ? `<tr><td style="padding:24px 32px 0;"><div style="font-size:13px;font-weight:700;color:#c8141e;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;">📝 Demandes</div><div style="background:#fafafa;border-radius:12px;border:1px solid #e8e8e8;padding:16px 20px;"><p style="margin:0;font-size:13px;"><strong>🎁 Échantillons :</strong> ${safe(sample_request)}</p></div></td></tr>` : ''}<tr><td style="padding:28px 32px;"><div style="border-top:1px solid #eee;padding-top:20px;text-align:center;"><p style="margin:0;font-size:11px;color:#aaa;">Frenchy Leurres · Gautier Fishing · Port-de-Bouc<br>Auto-entrepreneur non assujetti à la TVA — Art. 293B du CGI</p></div></td></tr></table></td></tr></table></body></html>`;
}

async function sendEmail(payload) {
  if (!RESEND_API_KEY) return;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: TO_EMAIL, subject: payload.subject, html: buildEmailHtml(payload.htmlData) })
  });
  if (!res.ok) { const txt = await res.text(); console.error('Resend error:', txt); }
}

async function ensureDb() {
  if (!pool) { console.log('DB init skipped: DATABASE_URL absente'); return; }
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
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_scheduled_payments_due ON scheduled_payments (status, due_at);`);
}

function validateCommonBody(body) {
  const amount = Number(body.amount);
  const customer_email = body.customer_email;
  const customer_name = body.customer_name;
  const delay_days = parseDays(body.delay_days);
  const order_ref = safe(body.order_ref);
  const company_name = safe(body.company_name);
  const total = Number(body.total || amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Montant invalide');
  if (!validateEmail(customer_email)) throw new Error('Email invalide');
  if (!customer_name || String(customer_name).trim().length < 2) throw new Error('Nom client invalide');
  return { amount, customer_email, customer_name, delay_days, order_ref, company_name, phone: body.phone || '', sample_request: body.sample_request || '', total, items: Array.isArray(body.items) ? body.items : [], currency: (body.currency || 'eur').toLowerCase() };
}

async function getOrCreateCustomer(email, name, companyName = '') {
  if (!stripe) throw new Error('Stripe non configuré');
  const customers = await stripe.customers.list({ email, limit: 1 });
  if (customers.data.length > 0) return customers.data[0];
  return stripe.customers.create({ email, name, metadata: { company_name: companyName || '' } });
}

async function insertScheduledPayment(data) {
  if (!pool) throw new Error('Base de données non connectée');
  const q = `INSERT INTO scheduled_payments (order_ref, payment_mode, delay_days, due_at, status, amount_cents, currency, company_name, customer_name, customer_email, phone, sample_request, total, items_json, stripe_customer_id, stripe_payment_intent_id, stripe_setup_intent_id, stripe_payment_method_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`;
  const values = [data.order_ref, data.payment_mode, data.delay_days, data.due_at, data.status, data.amount_cents, data.currency, data.company_name, data.customer_name, data.customer_email, data.phone, data.sample_request, data.total, JSON.stringify(data.items_json || []), data.stripe_customer_id, data.stripe_payment_intent_id, data.stripe_setup_intent_id, data.stripe_payment_method_id];
  const result = await pool.query(q, values);
  return result.rows[0].id;
}

async function markPaymentStatus(id, status, lastError = null, extra = {}) {
  const fields = ['status = $2', 'last_error = $3', 'updated_at = NOW()'];
  const values = [id, status, lastError];
  if (extra.stripe_payment_intent_id) { fields.push(`stripe_payment_intent_id = $${values.length + 1}`); values.push(extra.stripe_payment_intent_id); }
  await pool.query(`UPDATE scheduled_payments SET ${fields.join(', ')} WHERE id = $1`, values);
}

// --- ROUTES ---
app.get('/', (req, res) => res.json({ status: 'Frenchy Leurres API OK', dbConfigured: !!pool }));

app.post('/create-payment', async (req, res) => {
  try {
    const data = validateCommonBody(req.body);
    const captureDateObj = addDays(new Date(), data.delay_days);
    const captureDate = formatDateFR(captureDateObj);
    const customer = await getOrCreateCustomer(data.customer_email, data.customer_name, data.company_name);

    const pi = await stripe.paymentIntents.create({
      amount: amountToCents(data.amount),
      currency: data.currency,
      customer: customer.id,
      payment_method_types: ['card'],
      capture_method: data.delay_days === 0 ? 'automatic' : 'manual',
      metadata: { order_ref: data.order_ref, delay_days: String(data.delay_days) }
    });

    if (data.delay_days > 0) {
      await insertScheduledPayment({ ...data, due_at: captureDateObj.toISOString(), status: 'authorized_pending_capture', amount_cents: amountToCents(data.amount), items_json: data.items, stripe_customer_id: customer.id, stripe_payment_intent_id: pi.id, payment_mode: 'card' });
    }

    await sendEmail({ subject: `🎣 Commande Pro — ${data.company_name}`, htmlData: { ...data, title: 'Nouvelle Commande', payment_mode: 'Carte Bancaire', captureDate } });
    res.json({ clientSecret: pi.client_secret, captureDate });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/run-due-captures', async (req, res) => {
  const headerSecret = req.headers['x-cron-secret'];
  if (!CRON_SECRET || headerSecret !== CRON_SECRET) return res.status(401).json({ error: 'Non autorisé' });
  // Logique de capture simplifiée pour l'exemple
  res.json({ ok: true, message: 'Cron exécuté' });
});

ensureDb().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}).catch(err => {
  console.error('DB init error', err);
  app.listen(PORT, () => console.log(`Server running on port ${PORT} (DB ERROR)`));
});
