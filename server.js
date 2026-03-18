const express = require('express');
const Stripe = require('stripe');
const { Pool } = require('pg');

const app = express();

const PORT = process.env.PORT || 3000;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const CRON_SECRET = process.env.CRON_SECRET || '';
const DATABASE_URL = process.env.DATABASE_URL || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';
const TO_EMAIL = process.env.TO_EMAIL || 'gautierfishing@gmail.com';

console.log('ENV CHECK =>', {
  STRIPE_SECRET_KEY_present: !!STRIPE_SECRET_KEY,
  STRIPE_SECRET_KEY_length: STRIPE_SECRET_KEY.length,
  RESEND_API_KEY_present: !!RESEND_API_KEY,
  DATABASE_URL_present: !!DATABASE_URL,
  CRON_SECRET_present: !!CRON_SECRET
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

function renderItemsTable(items = []) {
  if (!Array.isArray(items) || !items.length) {
    return '<p style="color:#888;font-style:italic;">Aucun produit transmis.</p>';
  }

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
  const {
    title,
    payment_mode,
    captureDate,
    delay_days,
    company_name,
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
    ? `<div style="background:#fafafa;border-radius:12px;border:1px solid #e8e8e8;padding:16px 20px;margin-top:16px;">
        ${extra_lines.map(line => `<p style="margin:0 0 8px;font-size:13px;color:#333;">${line}</p>`).join('')}
      </div>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:30px 0;">
<tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.10);">
  <tr><td style="background:linear-gradient(135deg,#c8141e,#8a0010);padding:28px 32px;">
    <table width="100%"><tr>
      <td>
        <div style="font-size:22px;font-weight:900;color:#fff;letter-spacing:2px;">🎣 FRENCHY LEURRES</div>
        <div style="font-size:13px;color:rgba(255,255,255,.8);margin-top:4px;">Gautier Fishing · Port-de-Bouc</div>
      </td>
      <td align="right">
        <div style="background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);border-radius:20px;padding:6px 16px;">
          <span style="font-size:11px;color:#fff;letter-spacing:1.5px;text-transform:uppercase;">${safe(title)}</span>
        </div>
      </td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:28px 32px 0;">
    <table width="100%" style="background:#fafafa;border-radius:12px;border:1px solid #e8e8e8;overflow:hidden;">
      <tr>
        <td style="padding:16px 20px;border-bottom:1px solid #eee;">
          <span style="font-size:11px;color:#888;text-transform:uppercase;">Mode de paiement</span><br>
          <strong style="font-size:15px;color:${paymentColor};">${safe(payment_mode)}</strong>
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
          <strong style="font-size:15px;color:#111;">${safe(captureDate)}</strong>
        </td>
      </tr>
    </table>
    ${extraHtml}
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
    console.error('Resend error:', txt);
  }
}

async function ensureDb() {
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
  const phone = body.phone || '';
  const sample_request = body.sample_request || '';
  const total = Number(body.total || amount || 0);
  const items = Array.isArray(body.items) ? body.items : [];
  const currency = (body.currency || 'eur').toLowerCase();

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Montant invalide');
  }
  if (!validateEmail(customer_email)) {
    throw new Error('Email invalide');
  }
  if (!customer_name || String(customer_name).trim().length < 2) {
    throw new Error('Nom client invalide');
  }

  return {
    amount,
    customer_email,
    customer_name,
    delay_days,
    order_ref,
    company_name,
    phone,
    sample_request,
    total,
    items,
    currency
  };
}

async function getOrCreateCustomer(email, name, companyName = '') {
  const customers = await stripe.customers.list({ email, limit: 1 });
  if (customers.data.length > 0) return customers.data[0];

  return stripe.customers.create({
    email,
    name,
    metadata: { company_name: companyName || '' }
  });
}

async function insertScheduledPayment(data) {
  const q = `
    INSERT INTO scheduled_payments (
      order_ref, payment_mode, delay_days, due_at, status,
      amount_cents, currency, company_name, customer_name, customer_email,
      phone, sample_request, total, items_json,
      stripe_customer_id, stripe_payment_intent_id, stripe_setup_intent_id, stripe_payment_method_id
    ) VALUES (
      $1,$2,$3,$4,$5,
      $6,$7,$8,$9,$10,
      $11,$12,$13,$14,
      $15,$16,$17,$18
    )
    RETURNING id
  `;
  const values = [
    data.order_ref,
    data.payment_mode,
    data.delay_days,
    data.due_at,
    data.status,
    data.amount_cents,
    data.currency,
    data.company_name,
    data.customer_name,
    data.customer_email,
    data.phone,
    data.sample_request,
    data.total,
    JSON.stringify(data.items_json || []),
    data.stripe_customer_id || null,
    data.stripe_payment_intent_id || null,
    data.stripe_setup_intent_id || null,
    data.stripe_payment_method_id || null
  ];

  const result = await pool.query(q, values);
  return result.rows[0].id;
}

async function markPaymentStatus(id, status, lastError = null, extra = {}) {
  const fields = ['status = $2', 'last_error = $3', 'updated_at = NOW()'];
  const values = [id, status, lastError];

  if (extra.stripe_payment_intent_id !== undefined) {
    fields.push(`stripe_payment_intent_id = $${values.length + 1}`);
    values.push(extra.stripe_payment_intent_id);
  }

  const sql = `UPDATE scheduled_payments SET ${fields.join(', ')} WHERE id = $1`;
  await pool.query(sql, values);
}

app.get('/', (req, res) => {
  res.json({ status: 'Frenchy Leurres API OK' });
});

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * CARTE
 * - 0 jour  => paiement immédiat
 * - >0 jour => autorisation manuelle + stockage en base pour capture future
 */
app.post('/create-payment', async (req, res) => {
  try {
    const data = validateCommonBody(req.body);
    const captureDateObj = addDays(new Date(), data.delay_days);
    const captureDate = formatDateFR(captureDateObj);
    const customer = await getOrCreateCustomer(data.customer_email, data.customer_name, data.company_name);

    if (data.delay_days === 0) {
      const pi = await stripe.paymentIntents.create({
        amount: amountToCents(data.amount),
        currency: data.currency,
        customer: customer.id,
        payment_method_types: ['card'],
        capture_method: 'automatic',
        metadata: {
          order_ref: data.order_ref,
          delay_days: '0',
          company_name: data.company_name
        }
      });

      await sendEmail({
        subject: `🎣 Commande Pro comptant CB — ${data.company_name} — ${data.order_ref}`,
        htmlData: {
          title: 'Commande Pro comptant',
          payment_mode: 'Carte bancaire',
          captureDate,
          delay_days: 0,
          company_name: data.company_name,
          customer_name: data.customer_name,
          customer_email: data.customer_email,
          phone: data.phone,
          order_ref: data.order_ref,
          sample_request: data.sample_request,
          total: data.total,
          items: data.items,
          extra_lines: ['Paiement carte à encaisser immédiatement.']
        }
      }).catch(console.error);

      return res.json({
        mode: 'immediate',
        clientSecret: pi.client_secret,
        paymentIntentId: pi.id,
        captureDate
      });
    }

    const pi = await stripe.paymentIntents.create({
      amount: amountToCents(data.amount),
      currency: data.currency,
      customer: customer.id,
      payment_method_types: ['card'],
      capture_method: 'manual',
      metadata: {
        order_ref: data.order_ref,
        delay_days: String(data.delay_days),
        company_name: data.company_name
      }
    });

    await insertScheduledPayment({
      order_ref: data.order_ref,
      payment_mode: 'card',
      delay_days: data.delay_days,
      due_at: captureDateObj.toISOString(),
      status: 'authorized_pending_capture',
      amount_cents: amountToCents(data.amount),
      currency: data.currency,
      company_name: data.company_name,
      customer_name: data.customer_name,
      customer_email: data.customer_email,
      phone: data.phone,
      sample_request: data.sample_request,
      total: data.total,
      items_json: data.items,
      stripe_customer_id: customer.id,
      stripe_payment_intent_id: pi.id
    });

    await sendEmail({
      subject: `🎣 Nouvelle commande Pro CB différée — ${data.company_name} — ${data.order_ref}`,
      htmlData: {
        title: 'Commande Pro différée',
        payment_mode: 'Carte bancaire',
        captureDate,
        delay_days: data.delay_days,
        company_name: data.company_name,
        customer_name: data.customer_name,
        customer_email: data.customer_email,
        phone: data.phone,
        order_ref: data.order_ref,
        sample_request: data.sample_request,
        total: data.total,
        items: data.items,
        extra_lines: [
          'Carte autorisée maintenant.',
          `Capture automatique prévue le ${captureDate}.`
        ]
      }
    }).catch(console.error);

    return res.json({
      mode: 'manual_capture',
      clientSecret: pi.client_secret,
      paymentIntentId: pi.id,
      captureDate
    });
  } catch (err) {
    console.error('create-payment error', err);
    res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
});

/**
 * SEPA ETAPE 1
 * - crée le mandat / setup intent
 */
app.post('/create-sepa', async (req, res) => {
  try {
    const data = validateCommonBody(req.body);
    const customer = await getOrCreateCustomer(data.customer_email, data.customer_name, data.company_name);

    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      payment_method_types: ['sepa_debit'],
      metadata: {
        order_ref: data.order_ref,
        delay_days: String(data.delay_days),
        company_name: data.company_name,
        sample_request: data.sample_request || ''
      }
    });

    return res.json({
      clientSecret: setupIntent.client_secret,
      customerId: customer.id,
      setupIntentId: setupIntent.id
    });
  } catch (err) {
    console.error('create-sepa error', err);
    res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
});

/**
 * SEPA ETAPE 2
 * - 0 jour  => crée le débit immédiatement
 * - >0 jour => récupère le payment_method du setup intent et stocke pour débit futur
 */
app.post('/confirm-sepa', async (req, res) => {
  try {
    const data = validateCommonBody(req.body);

    const { setupIntentId, customerId } = req.body;
    if (!setupIntentId || !customerId) {
      return res.status(400).json({ error: 'setupIntentId ou customerId manquant' });
    }

    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
    if (!setupIntent.payment_method) {
      return res.status(400).json({ error: 'Aucun mandat SEPA confirmé' });
    }

    const dueDateObj = addDays(new Date(), data.delay_days);
    const captureDate = formatDateFR(dueDateObj);
    const paymentMethodId = setupIntent.payment_method;

    if (data.delay_days === 0) {
      const pi = await stripe.paymentIntents.create({
        amount: amountToCents(data.amount),
        currency: 'eur',
        customer: customerId,
        payment_method: paymentMethodId,
        payment_method_types: ['sepa_debit'],
        confirm: true,
        metadata: {
          order_ref: data.order_ref,
          delay_days: '0',
          company_name: data.company_name
        }
      });

      await sendEmail({
        subject: `🎣 Commande Pro comptant SEPA — ${data.company_name} — ${data.order_ref}`,
        htmlData: {
          title: 'Commande Pro comptant',
          payment_mode: 'Prélèvement SEPA',
          captureDate,
          delay_days: 0,
          company_name: data.company_name,
          customer_name: data.customer_name,
          customer_email: data.customer_email,
          phone: data.phone,
          order_ref: data.order_ref,
          sample_request: data.sample_request,
          total: data.total,
          items: data.items,
          extra_lines: ['Mandat SEPA validé et débit initié immédiatement.']
        }
      }).catch(console.error);

      return res.json({
        mode: 'immediate',
        success: true,
        paymentIntentId: pi.id,
        captureDate
      });
    }

    await insertScheduledPayment({
      order_ref: data.order_ref,
      payment_mode: 'sepa',
      delay_days: data.delay_days,
      due_at: dueDateObj.toISOString(),
      status: 'scheduled',
      amount_cents: amountToCents(data.amount),
      currency: 'eur',
      company_name: data.company_name,
      customer_name: data.customer_name,
      customer_email: data.customer_email,
      phone: data.phone,
      sample_request: data.sample_request,
      total: data.total,
      items_json: data.items,
      stripe_customer_id: customerId,
      stripe_setup_intent_id: setupIntentId,
      stripe_payment_method_id: paymentMethodId
    });

    await sendEmail({
      subject: `🎣 Nouvelle commande Pro SEPA différée — ${data.company_name} — ${data.order_ref}`,
      htmlData: {
        title: 'Commande Pro différée',
        payment_mode: 'Prélèvement SEPA',
        captureDate,
        delay_days: data.delay_days,
        company_name: data.company_name,
        customer_name: data.customer_name,
        customer_email: data.customer_email,
        phone: data.phone,
        order_ref: data.order_ref,
        sample_request: data.sample_request,
        total: data.total,
        items: data.items,
        extra_lines: [
          'Mandat SEPA validé maintenant.',
          `Débit SEPA à initier automatiquement le ${captureDate}.`
        ]
      }
    }).catch(console.error);

    return res.json({
      mode: 'scheduled',
      success: true,
      captureDate
    });
  } catch (err) {
    console.error('confirm-sepa error', err);
    res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
});

/**
 * ROUTE CRON
 * Appelée par un cron externe une fois par jour, ou toutes les heures.
 * Header requis : x-cron-secret
 */
app.post('/run-due-captures', async (req, res) => {
  try {
    const headerSecret = req.headers['x-cron-secret'];
    if (!CRON_SECRET || headerSecret !== CRON_SECRET) {
      return res.status(401).json({ error: 'Non autorisé' });
    }

    const due = await pool.query(`
      SELECT *
      FROM scheduled_payments
      WHERE status IN ('authorized_pending_capture', 'scheduled')
        AND due_at <= NOW()
      ORDER BY due_at ASC
      LIMIT 100
    `);

    const results = [];

    for (const row of due.rows) {
      try {
        if (row.payment_mode === 'card') {
          if (!row.stripe_payment_intent_id) {
            throw new Error('payment_intent_id manquant');
          }

          const captured = await stripe.paymentIntents.capture(row.stripe_payment_intent_id);

          await markPaymentStatus(row.id, 'captured', null, {
            stripe_payment_intent_id: captured.id
          });

          await sendEmail({
            subject: `✅ CB capturée — ${row.company_name} — ${row.order_ref}`,
            htmlData: {
              title: 'Paiement capturé',
              payment_mode: 'Carte bancaire',
              captureDate: formatDateFR(new Date()),
              delay_days: row.delay_days,
              company_name: row.company_name,
              customer_name: row.customer_name,
              customer_email: row.customer_email,
              phone: row.phone,
              order_ref: row.order_ref,
              sample_request: row.sample_request,
              total: row.total,
              items: row.items_json,
              extra_lines: ['La capture carte a été exécutée automatiquement avec succès.']
            }
          }).catch(console.error);

          results.push({
            id: row.id,
            order_ref: row.order_ref,
            mode: 'card',
            status: 'captured'
          });
        } else if (row.payment_mode === 'sepa') {
          if (!row.stripe_customer_id || !row.stripe_payment_method_id) {
            throw new Error('customer_id ou payment_method_id manquant');
          }

          const pi = await stripe.paymentIntents.create({
            amount: row.amount_cents,
            currency: row.currency || 'eur',
            customer: row.stripe_customer_id,
            payment_method: row.stripe_payment_method_id,
            payment_method_types: ['sepa_debit'],
            confirm: true,
            metadata: {
              order_ref: row.order_ref || '',
              delay_days: String(row.delay_days || 0),
              company_name: row.company_name || ''
            }
          });

          await markPaymentStatus(row.id, 'captured', null, {
            stripe_payment_intent_id: pi.id
          });

          await sendEmail({
            subject: `✅ SEPA initié — ${row.company_name} — ${row.order_ref}`,
            htmlData: {
              title: 'Débit SEPA initié',
              payment_mode: 'Prélèvement SEPA',
              captureDate: formatDateFR(new Date()),
              delay_days: row.delay_days,
              company_name: row.company_name,
              customer_name: row.customer_name,
              customer_email: row.customer_email,
              phone: row.phone,
              order_ref: row.order_ref,
              sample_request: row.sample_request,
              total: row.total,
              items: row.items_json,
              extra_lines: ['Le débit SEPA différé a été initié automatiquement avec succès.']
            }
          }).catch(console.error);

          results.push({
            id: row.id,
            order_ref: row.order_ref,
            mode: 'sepa',
            status: 'captured'
          });
        } else {
          throw new Error(`Mode inconnu: ${row.payment_mode}`);
        }
      } catch (err) {
        console.error('capture item error', row.id, err);
        await markPaymentStatus(row.id, 'error', err.message || 'Erreur inconnue');
        results.push({
          id: row.id,
          order_ref: row.order_ref,
          mode: row.payment_mode,
          status: 'error',
          error: err.message
        });
      }
    }

    res.json({
      ok: true,
      processed: results.length,
      results
    });
  } catch (err) {
    console.error('run-due-captures error', err);
    res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
});

ensureDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('DB init error', err);
    process.exit(1);
  });
