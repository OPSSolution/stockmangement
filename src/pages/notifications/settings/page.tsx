import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import { useNotifications } from '@/contexts/NotificationContext';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/feature/DashboardLayout';
import { logAudit } from '@/lib/auditLog';

const CATEGORIES = ['Electronics', 'Furniture', 'Lighting', 'Smart Home', 'Accessories'] as const;
const TRIGGER_TYPES = [
  { value: 'stock_below_threshold', label: 'Stock Below Threshold' },
  { value: 'order_pending_aging', label: 'Order Pending Too Long' },
  { value: 'return_unresolved', label: 'Return Unresolved Too Long' },
  { value: 'transfer_overdue', label: 'Transfer Request Overdue' },
] as const;
const NOTIF_TYPES = [
  { value: 'low_stock', label: 'Low Stock' },
  { value: 'out_of_stock', label: 'Out of Stock' },
  { value: 'new_order', label: 'New Order' },
  { value: 'return_pending', label: 'Return Pending' },
  { value: 'system', label: 'System' },
] as const;

interface AlertRule {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_condition: Record<string, unknown>;
  notification_type: string;
  message_template: string;
  is_active: boolean;
  created_at: string;
}

interface WebhookConfig {
  id: string;
  name: string;
  provider: 'slack' | 'discord' | 'telegram' | 'custom';
  webhook_url: string;
  secret_token: string | null;
  is_active: boolean;
  notify_on_types: string[];
  created_at: string;
}

interface ToastState {
  visible: boolean;
  message: string;
  type: 'success' | 'error';
}

const PROVIDER_ICONS: Record<string, string> = {
  slack: 'ri-slack-line',
  discord: 'ri-discord-line',
  telegram: 'ri-telegram-line',
  custom: 'ri-links-line',
};

const PROVIDER_LABELS: Record<string, string> = {
  slack: 'Slack',
  discord: 'Discord',
  telegram: 'Telegram',
  custom: 'Custom URL',
};

export default function NotificationSettingsPage() {
  const { settings, refresh, requestBrowserPush, browserPushPermission, browserPushSupported, subscribeBrowserPush, unsubscribeBrowserPush, browserPushSubscribed } = useNotifications();
  const { user, isAdmin, canEdit, canDelete } = useAuth();
  const showEdit = canEdit('notifications_settings');
  const showDelete = canDelete('notifications_settings');
  const navigate = useNavigate();

  // Settings state
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [inAppEnabled, setInAppEnabled] = useState(true);
  const [browserPushEnabled, setBrowserPushEnabled] = useState(true);
  const [thresholds, setThresholds] = useState<Record<string, number>>({});
  const [vapidLoading, setVapidLoading] = useState(false);
  const [vapidKeys, setVapidKeys] = useState<{ publicKey: string; privateKey: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>({ visible: false, message: '', type: 'success' });

  // Alert rules state
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [ruleForm, setRuleForm] = useState({
    name: '',
    description: '',
    trigger_type: 'stock_below_threshold',
    older_than_hours: 24,
    category: '',
    threshold: 5,
    status: 'pending',
    notification_type: 'system',
    message_template: 'Alert: {{name}}',
    is_active: true,
  });

  // Webhook configs state
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [webhooksLoading, setWebhooksLoading] = useState(false);
  const [showWebhookForm, setShowWebhookForm] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<WebhookConfig | null>(null);
  const [webhookForm, setWebhookForm] = useState({
    name: '',
    provider: 'slack' as 'slack' | 'discord' | 'telegram' | 'custom',
    webhook_url: '',
    secret_token: '',
    is_active: true,
    notify_on_types: [] as string[],
  });

  useEffect(() => {
    if (settings) {
      setEmailEnabled(settings.email_enabled);
      setSmsEnabled(settings.sms_enabled);
      setInAppEnabled(settings.in_app_enabled);
      setBrowserPushEnabled(settings.browser_push_enabled);
      setThresholds(settings.category_thresholds || {});
    }
  }, [settings]);

  // Load alert rules for admin
  useEffect(() => {
    if (!isAdmin) return;
    async function loadRules() {
      setRulesLoading(true);
      const { data, error } = await supabase
        .from('alert_rules')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) {
        setRules(data as AlertRule[]);
      }
      setRulesLoading(false);
    }
    loadRules();
  }, [isAdmin]);

  // Load webhooks for admin
  useEffect(() => {
    if (!isAdmin) return;
    async function loadWebhooks() {
      setWebhooksLoading(true);
      const { data, error } = await supabase
        .from('webhook_configs')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) {
        setWebhooks(data as WebhookConfig[]);
      }
      setWebhooksLoading(false);
    }
    loadWebhooks();
  }, [isAdmin]);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast((prev) => ({ ...prev, visible: false })), 3000);
  }, []);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const payload = {
      user_id: user.id,
      email_enabled: emailEnabled,
      sms_enabled: smsEnabled,
      in_app_enabled: inAppEnabled,
      browser_push_enabled: browserPushEnabled,
      category_thresholds: thresholds,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('notification_settings')
      .upsert(payload, { onConflict: 'user_id' });

    if (error) {
      showToast('Failed to save settings: ' + error.message, 'error');
    } else {
      showToast('Notification settings saved successfully');
      await refresh();
      logAudit({ action: 'update', module: 'notifications', description: 'Updated notification settings' });
    }

    setSaving(false);
  };

  const handleTestNotification = async () => {
    const { error } = await supabase.from('notifications').insert({
      user_id: user?.id,
      type: 'system',
      title: 'Test Notification',
      message: 'This is a test notification from your settings page.',
      data: {},
      is_read: false,
      is_emailed: false,
      is_sms_sent: false,
    });

    if (error) {
      showToast('Failed to send test: ' + error.message, 'error');
    } else {
      showToast('Test notification sent! Check your bell icon.');
      logAudit({ action: 'create', module: 'notifications', description: 'Sent a test notification' });
    }
  };

  const handleRequestPush = async () => {
    if (browserPushSubscribed) {
      const ok = await unsubscribeBrowserPush();
      if (ok) {
        showToast('Browser push notifications disabled');
      } else {
        showToast('Failed to disable push notifications', 'error');
      }
    } else {
      const ok = await subscribeBrowserPush();
      if (ok) {
        showToast('Browser push notifications enabled');
      } else {
        showToast('Push permission denied or setup incomplete. Check VAPID keys.', 'error');
      }
    }
  };

  const handleGenerateVapid = async () => {
    setVapidLoading(true);
    try {
      const { data, error } = await api.functions.invoke('generate-vapid-keys', {});
      if (error || !data?.publicKey) {
        showToast('Failed to generate VAPID keys: ' + (error || 'Unknown error'), 'error');
      } else {
        setVapidKeys({ publicKey: data.publicKey, privateKey: data.privateKey });
        showToast('VAPID keys generated! Copy the private key to your Supabase secrets.');
        logAudit({ action: 'create', module: 'notifications', description: 'Generated new VAPID keys' });
      }
    } catch (err) {
      showToast('Failed to generate VAPID keys: ' + (err as Error).message, 'error');
    }
    setVapidLoading(false);
  };

  // Alert rules handlers
  const openNewRule = () => {
    setEditingRule(null);
    setRuleForm({
      name: '',
      description: '',
      trigger_type: 'stock_below_threshold',
      older_than_hours: 24,
      category: '',
      threshold: 5,
      status: 'pending',
      notification_type: 'low_stock',
      message_template: '{{name}}: Stock for {{data.product_name}} is below threshold.',
      is_active: true,
    });
    setShowRuleForm(true);
  };

  const openEditRule = (rule: AlertRule) => {
    setEditingRule(rule);
    const cond = rule.trigger_condition;
    setRuleForm({
      name: rule.name,
      description: rule.description || '',
      trigger_type: rule.trigger_type,
      older_than_hours: (cond.older_than_hours as number) || 24,
      category: (cond.category as string) || '',
      threshold: (cond.threshold as number) || 5,
      status: (cond.status as string) || 'pending',
      notification_type: rule.notification_type,
      message_template: rule.message_template,
      is_active: rule.is_active,
    });
    setShowRuleForm(true);
  };

  const handleSaveRule = async () => {
    if (!user) return;

    // Validation
    if (!ruleForm.name.trim()) {
      showToast('Rule name is required', 'error');
      return;
    }
    if (!ruleForm.message_template.trim()) {
      showToast('Message template is required', 'error');
      return;
    }

    const condition: Record<string, unknown> = {};
    if (ruleForm.trigger_type === 'stock_below_threshold') {
      condition.threshold = ruleForm.threshold;
      if (ruleForm.category) condition.category = ruleForm.category;
    } else {
      condition.older_than_hours = ruleForm.older_than_hours;
      condition.status = ruleForm.status;
    }

    const payload = {
      name: ruleForm.name.trim(),
      description: ruleForm.description.trim() || null,
      trigger_type: ruleForm.trigger_type,
      trigger_condition: condition,
      notification_type: ruleForm.notification_type,
      message_template: ruleForm.message_template.trim(),
      is_active: ruleForm.is_active,
    };

    let error;
    if (editingRule) {
      const { error: e } = await supabase
        .from('alert_rules')
        .update(payload)
        .eq('id', editingRule.id);
      error = e;
    } else {
      const { error: e } = await supabase.from('alert_rules').insert(payload);
      error = e;
    }

    if (error) {
      showToast('Failed to save rule: ' + error.message, 'error');
    } else {
      showToast(editingRule ? 'Rule updated' : 'Rule created');
      setShowRuleForm(false);
      setEditingRule(null);
      const { data } = await supabase.from('alert_rules').select('*').order('created_at', { ascending: false });
      if (data) setRules(data as AlertRule[]);
      logAudit({
        action: editingRule ? 'update' : 'create',
        module: 'notifications',
        description: `${editingRule ? 'Updated' : 'Created'} alert rule "${ruleForm.name.trim()}"`,
        referenceId: editingRule?.id,
      });
    }
  };

  const handleToggleRule = async (rule: AlertRule) => {
    const { error } = await supabase
      .from('alert_rules')
      .update({ is_active: !rule.is_active })
      .eq('id', rule.id);

    if (error) {
      showToast('Failed to toggle rule', 'error');
    } else {
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, is_active: !r.is_active } : r))
      );
      logAudit({ action: 'update', module: 'notifications', description: `${rule.is_active ? 'Disabled' : 'Enabled'} alert rule "${rule.name}"`, referenceId: rule.id });
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    const ruleName = rules.find((r) => r.id === ruleId)?.name || ruleId;
    const { error } = await supabase.from('alert_rules').delete().eq('id', ruleId);
    if (error) {
      showToast('Failed to delete rule', 'error');
    } else {
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
      showToast('Rule deleted');
      logAudit({ action: 'delete', module: 'notifications', description: `Deleted alert rule "${ruleName}"`, referenceId: ruleId });
    }
  };

  // Webhook handlers
  const openNewWebhook = () => {
    setEditingWebhook(null);
    setWebhookForm({
      name: '',
      provider: 'slack',
      webhook_url: '',
      secret_token: '',
      is_active: true,
      notify_on_types: [],
    });
    setShowWebhookForm(true);
  };

  const openEditWebhook = (wh: WebhookConfig) => {
    setEditingWebhook(wh);
    setWebhookForm({
      name: wh.name,
      provider: wh.provider,
      webhook_url: wh.webhook_url,
      secret_token: wh.secret_token || '',
      is_active: wh.is_active,
      notify_on_types: wh.notify_on_types || [],
    });
    setShowWebhookForm(true);
  };

  const handleSaveWebhook = async () => {
    if (!user || !isAdmin) return;

    const payload = {
      name: webhookForm.name,
      provider: webhookForm.provider,
      webhook_url: webhookForm.webhook_url,
      secret_token: webhookForm.secret_token || null,
      is_active: webhookForm.is_active,
      notify_on_types: webhookForm.notify_on_types,
    };

    let error;
    if (editingWebhook) {
      const { error: e } = await supabase
        .from('webhook_configs')
        .update(payload)
        .eq('id', editingWebhook.id);
      error = e;
    } else {
      const { error: e } = await supabase.from('webhook_configs').insert(payload);
      error = e;
    }

    if (error) {
      showToast('Failed to save webhook: ' + error.message, 'error');
    } else {
      showToast(editingWebhook ? 'Webhook updated' : 'Webhook created');
      setShowWebhookForm(false);
      setEditingWebhook(null);
      const { data } = await supabase.from('webhook_configs').select('*').order('created_at', { ascending: false });
      if (data) setWebhooks(data as WebhookConfig[]);
      logAudit({
        action: editingWebhook ? 'update' : 'create',
        module: 'notifications',
        description: `${editingWebhook ? 'Updated' : 'Created'} webhook "${webhookForm.name}"`,
        referenceId: editingWebhook?.id,
      });
    }
  };

  const handleToggleWebhook = async (wh: WebhookConfig) => {
    const { error } = await supabase
      .from('webhook_configs')
      .update({ is_active: !wh.is_active })
      .eq('id', wh.id);

    if (error) {
      showToast('Failed to toggle webhook', 'error');
    } else {
      setWebhooks((prev) =>
        prev.map((w) => (w.id === wh.id ? { ...w, is_active: !w.is_active } : w))
      );
      logAudit({ action: 'update', module: 'notifications', description: `${wh.is_active ? 'Disabled' : 'Enabled'} webhook "${wh.name}"`, referenceId: wh.id });
    }
  };

  const handleDeleteWebhook = async (whId: string) => {
    const whName = webhooks.find((w) => w.id === whId)?.name || whId;
    const { error } = await supabase.from('webhook_configs').delete().eq('id', whId);
    if (error) {
      showToast('Failed to delete webhook', 'error');
    } else {
      setWebhooks((prev) => prev.filter((w) => w.id !== whId));
      showToast('Webhook deleted');
      logAudit({ action: 'delete', module: 'notifications', description: `Deleted webhook "${whName}"`, referenceId: whId });
    }
  };

  const handleTestWebhook = async (wh: WebhookConfig) => {
    try {
      const { data, error } = await api.functions.invoke('webhook-dispatch', {
        body: {
          notification: {
            id: 'test-' + Date.now(),
            type: 'system',
            title: 'Webhook Test',
            message: `This is a test notification for your ${PROVIDER_LABELS[wh.provider]} integration.`,
          },
          config_ids: [wh.id],
        },
      });
      if (error || !data?.dispatched) {
        showToast('Webhook test failed — check your URL and secret', 'error');
      } else {
        showToast(`Test sent to ${PROVIDER_LABELS[wh.provider]} successfully`);
        logAudit({ action: 'create', module: 'notifications', description: `Sent test webhook to "${wh.name}"`, referenceId: wh.id });
      }
    } catch (err) {
      showToast('Webhook test failed: ' + (err as Error).message, 'error');
    }
  };

  const ToggleRow = ({
    label,
    description,
    enabled,
    onChange,
    disabled = false,
    extraAction,
  }: {
    label: string;
    description: string;
    enabled: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
    extraAction?: React.ReactNode;
  }) => (
    <div className="flex items-start justify-between py-4 border-b border-gray-50 last:border-b-0">
      <div className="flex-1 min-w-0 pr-4">
        <p className="text-sm font-semibold text-gray-800">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{description}</p>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {extraAction}
        <button
          onClick={() => !disabled && onChange(!enabled)}
          className={`relative w-11 h-6 rounded-full transition-colors duration-200 cursor-pointer ${
            enabled && !disabled ? 'bg-emerald-500' : 'bg-gray-200'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          disabled={disabled}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${
              enabled && !disabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    </div>
  );

  return (
    <DashboardLayout title="Notification Settings">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">Notification Settings</h1>
            <p className="text-sm text-gray-400 mt-1">Customize how and when you receive alerts</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/notifications/history')}
              className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap cursor-pointer"
            >
              <i className="ri-history-line mr-1"></i>
              History
            </button>
            <button
              onClick={() => navigate('/notifications/analytics')}
              className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap cursor-pointer"
            >
              <i className="ri-bar-chart-box-line mr-1"></i>
              Analytics
            </button>
          </div>
        </div>

        {/* Alert Channels */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900 tracking-tight">Alert Channels</h2>
            <p className="text-xs text-gray-400 mt-0.5">Choose which channels to receive notifications on</p>
          </div>
          <div className="px-6">
            <ToggleRow
              label="In-App Notifications"
              description="Receive alerts directly in the dashboard bell icon"
              enabled={inAppEnabled}
              onChange={setInAppEnabled}
            />
            <ToggleRow
              label="Email Notifications"
              description="Get alerts sent to your registered email address"
              enabled={emailEnabled}
              onChange={setEmailEnabled}
            />
            <ToggleRow
              label="SMS Notifications"
              description="Receive text messages for critical alerts"
              enabled={smsEnabled}
              onChange={setSmsEnabled}
            />
            <ToggleRow
              label="Browser Push Notifications"
              description={`${browserPushSubscribed ? 'Subscribed' : 'Not subscribed'} ${browserPushPermission === 'denied' ? '— permission denied' : ''}`}
              enabled={browserPushEnabled}
              onChange={(v) => {
                setBrowserPushEnabled(v);
                if (v && browserPushSupported && browserPushPermission !== 'granted') {
                  handleRequestPush();
                }
                if (!v && browserPushSubscribed) {
                  unsubscribeBrowserPush();
                }
              }}
              extraAction={
                browserPushSupported && browserPushPermission === 'denied' ? (
                  <span className="text-xs text-red-500">Blocked</span>
                ) : browserPushSubscribed ? (
                  <span className="text-xs text-emerald-600 font-medium">Active</span>
                ) : null
              }
            />
          </div>
        </div>

        {/* Browser Push Setup (Admin Only) */}
        {isAdmin && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-gray-900 tracking-tight">Browser Push Setup</h2>
                <p className="text-xs text-gray-400 mt-0.5">Generate VAPID keys to enable browser push notifications</p>
              </div>
              <button
                onClick={handleGenerateVapid}
                disabled={vapidLoading}
                className="px-4 py-2 bg-sky-600 text-white text-sm font-medium rounded-lg hover:bg-sky-700 transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
              >
                {vapidLoading ? (
                  <span className="flex items-center gap-1.5">
                    <i className="ri-loader-4-line animate-spin"></i>
                    Generating...
                  </span>
                ) : (
                  <>
                    <i className="ri-key-2-line mr-1"></i>
                    Generate Keys
                  </>
                )}
              </button>
            </div>
            <div className="px-6 py-4">
              {vapidKeys ? (
                <div className="space-y-3">
                  <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                    <p className="text-xs font-semibold text-emerald-700 mb-1">Public Key (auto-saved to app config)</p>
                    <code className="text-[10px] text-emerald-600 break-all font-mono">{vapidKeys.publicKey}</code>
                  </div>
                  <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                    <p className="text-xs font-semibold text-amber-700 mb-1">Private Key — save this to Supabase secrets!</p>
                    <code className="text-[10px] text-amber-600 break-all font-mono">{vapidKeys.privateKey}</code>
                  </div>
                  <div className="text-[10px] text-gray-400 space-y-0.5">
                    <p><i className="ri-terminal-line mr-1"></i>supabase secrets set VAPID_PRIVATE_KEY=&quot;{vapidKeys.privateKey}&quot;</p>
                    <p><i className="ri-information-line mr-1"></i>The public key is already stored in the app_config table for the frontend to use.</p>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-400">
                  <p>Browser push requires a VAPID keypair for secure communication with push services (FCM, Mozilla, etc.).</p>
                  <p className="mt-1">Click Generate Keys to create a new pair. Store the private key in your Supabase Edge Function secrets.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Category Thresholds */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900 tracking-tight">Stock Thresholds by Category</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Set custom low-stock alert thresholds for each product category
            </p>
          </div>
          <div className="px-6 py-2">
            {CATEGORIES.map((cat) => (
              <div key={cat} className="flex items-center justify-between py-3.5 border-b border-gray-50 last:border-b-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                    <i className="ri-archive-stack-line text-gray-400 text-sm"></i>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{cat}</p>
                    <p className="text-xs text-gray-400">Alert when stock drops below this number</p>
                  </div>
                </div>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={thresholds?.[cat] ?? 5}
                  onChange={(e) =>
                    setThresholds((prev) => ({
                      ...prev,
                      [cat]: Math.max(1, parseInt(e.target.value || '1', 10)),
                    }))
                  }
                  className="w-20 px-3 py-1.5 text-sm font-semibold text-gray-800 border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400 text-center"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Alert Rules (Admin Only) */}
        {isAdmin && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-gray-900 tracking-tight">Alert Rules</h2>
                <p className="text-xs text-gray-400 mt-0.5">Create custom notification triggers beyond stock thresholds</p>
              </div>
              <button
                onClick={openNewRule}
                className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap cursor-pointer"
              >
                <i className="ri-add-line mr-1"></i>
                New Rule
              </button>
            </div>

            {showRuleForm && (
              <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50">
                <h3 className="text-sm font-bold text-gray-900 mb-4">
                  {editingRule ? 'Edit Rule' : 'Create New Rule'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Rule Name</label>
                    <input
                      type="text"
                      value={ruleForm.name}
                      onChange={(e) => setRuleForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400"
                      placeholder="e.g., Pending Orders Over 24h"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Trigger Type</label>
                    <select
                      value={ruleForm.trigger_type}
                      onChange={(e) => setRuleForm((f) => ({ ...f, trigger_type: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400 bg-white"
                    >
                      {TRIGGER_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                  <input
                    type="text"
                    value={ruleForm.description}
                    onChange={(e) => setRuleForm((f) => ({ ...f, description: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400"
                    placeholder="What does this rule check for?"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  {ruleForm.trigger_type === 'stock_below_threshold' ? (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Category (optional)</label>
                        <select
                          value={ruleForm.category}
                          onChange={(e) => setRuleForm((f) => ({ ...f, category: e.target.value }))}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400 bg-white"
                        >
                          <option value="">All Categories</option>
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Threshold</label>
                        <input
                          type="number"
                          min={1}
                          value={ruleForm.threshold}
                          onChange={(e) => setRuleForm((f) => ({ ...f, threshold: parseInt(e.target.value) || 1 }))}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Older Than (hours)</label>
                        <input
                          type="number"
                          min={1}
                          value={ruleForm.older_than_hours}
                          onChange={(e) => setRuleForm((f) => ({ ...f, older_than_hours: parseInt(e.target.value) || 1 }))}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                        <input
                          type="text"
                          value={ruleForm.status}
                          onChange={(e) => setRuleForm((f) => ({ ...f, status: e.target.value }))}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400"
                          placeholder="pending"
                        />
                      </div>
                    </>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Notification Type</label>
                    <select
                      value={ruleForm.notification_type}
                      onChange={(e) => setRuleForm((f) => ({ ...f, notification_type: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400 bg-white"
                    >
                      {NOTIF_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Message Template</label>
                  <input
                    type="text"
                    value={ruleForm.message_template}
                    onChange={(e) => setRuleForm((f) => ({ ...f, message_template: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400"
                    placeholder="Alert: {{name}}"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    Use {'{{name}}'} for rule name, {'{{data.order_id}}'} for order IDs, etc.
                  </p>
                </div>

                <div className="mb-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ruleForm.is_active}
                      onChange={(e) => setRuleForm((f) => ({ ...f, is_active: e.target.checked }))}
                      className="w-4 h-4 accent-emerald-600 rounded"
                    />
                    <span className="text-sm text-gray-700">Active</span>
                  </label>
                  <p className="text-[10px] text-gray-400 mt-0.5 ml-6">
                    Inactive rules are skipped during evaluation
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSaveRule}
                    className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    {editingRule ? 'Update Rule' : 'Create Rule'}
                  </button>
                  <button
                    onClick={() => { setShowRuleForm(false); setEditingRule(null); }}
                    className="px-5 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="px-6 py-2">
              {rulesLoading ? (
                <div className="py-8 text-center">
                  <i className="ri-loader-4-line animate-spin text-gray-400"></i>
                </div>
              ) : rules.length === 0 ? (
                <div className="py-8 text-center">
                  <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-2">
                    <i className="ri-slideshow-line text-gray-300 text-xl"></i>
                  </div>
                  <p className="text-sm text-gray-400">No custom alert rules yet</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {rules.map((rule) => (
                    <div key={rule.id} className="py-4 flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-800">{rule.name}</p>
                          <span
                            className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                              rule.is_active
                                ? 'bg-emerald-50 text-emerald-600'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {rule.is_active ? 'Active' : 'Paused'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{rule.description}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded">
                            {TRIGGER_TYPES.find((t) => t.value === rule.trigger_type)?.label || rule.trigger_type}
                          </span>
                          <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded">
                            {NOTIF_TYPES.find((t) => t.value === rule.notification_type)?.label || rule.notification_type}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleToggleRule(rule)}
                          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                            rule.is_active
                              ? 'hover:bg-emerald-50 text-gray-400 hover:text-emerald-500'
                              : 'hover:bg-emerald-50 text-gray-400 hover:text-emerald-500'
                          }`}
                          title={rule.is_active ? 'Pause' : 'Activate'}
                        >
                          <i className={`${rule.is_active ? 'ri-pause-circle-line' : 'ri-play-circle-line'} text-lg`}></i>
                        </button>
                        {showEdit && (
                          <button
                            onClick={() => openEditRule(rule)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                            title="Edit"
                          >
                            <i className="ri-edit-line text-sm"></i>
                          </button>
                        )}
                        {showDelete && (
                          <button
                            onClick={() => handleDeleteRule(rule.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                            title="Delete"
                          >
                            <i className="ri-delete-bin-line text-sm"></i>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Webhook Integrations (Admin Only) */}
        {isAdmin && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-gray-900 tracking-tight">Webhook Integrations</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Send alerts to Slack, Discord, Telegram, or custom endpoints
                </p>
              </div>
              <button
                onClick={openNewWebhook}
                className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap cursor-pointer"
              >
                <i className="ri-add-line mr-1"></i>
                Add Webhook
              </button>
            </div>

            {showWebhookForm && (
              <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50">
                <h3 className="text-sm font-bold text-gray-900 mb-4">
                  {editingWebhook ? 'Edit Webhook' : 'Add Webhook Integration'}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
                    <input
                      type="text"
                      value={webhookForm.name}
                      onChange={(e) => setWebhookForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400"
                      placeholder="e.g., Engineering Slack"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Provider</label>
                    <select
                      value={webhookForm.provider}
                      onChange={(e) => setWebhookForm((f) => ({ ...f, provider: e.target.value as WebhookConfig['provider'] }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400 bg-white"
                    >
                      <option value="slack">Slack</option>
                      <option value="discord">Discord</option>
                      <option value="telegram">Telegram</option>
                      <option value="custom">Custom URL</option>
                    </select>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Webhook URL</label>
                  <input
                    type="text"
                    value={webhookForm.webhook_url}
                    onChange={(e) => setWebhookForm((f) => ({ ...f, webhook_url: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400"
                    placeholder={
                      webhookForm.provider === 'slack'
                        ? 'https://hooks.slack.com/services/...'
                        : webhookForm.provider === 'discord'
                        ? 'https://discord.com/api/webhooks/...'
                        : webhookForm.provider === 'telegram'
                        ? 'https://api.telegram.org/botTOKEN/sendMessage'
                        : 'https://your-api.com/webhook'
                    }
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Secret Token / API Key / Chat ID
                  </label>
                  <input
                    type="text"
                    value={webhookForm.secret_token}
                    onChange={(e) => setWebhookForm((f) => ({ ...f, secret_token: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400"
                    placeholder={
                      webhookForm.provider === 'telegram'
                        ? '@channelname or chat ID'
                        : 'Optional bearer token or secret'
                    }
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    {webhookForm.provider === 'slack' && 'Optional: Slack app bearer token for richer formatting'}
                    {webhookForm.provider === 'discord' && 'Discord webhooks do not require a token'}
                    {webhookForm.provider === 'telegram' && 'Required: Telegram chat ID or channel username'}
                    {webhookForm.provider === 'custom' && 'Optional: Sent as X-Webhook-Secret header'}
                  </p>
                </div>

                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Notify On Types</label>
                  <div className="flex flex-wrap gap-2">
                    {NOTIF_TYPES.map((t) => {
                      const checked = webhookForm.notify_on_types.includes(t.value);
                      return (
                        <button
                          key={t.value}
                          onClick={() =>
                            setWebhookForm((f) => ({
                              ...f,
                              notify_on_types: checked
                                ? f.notify_on_types.filter((x) => x !== t.value)
                                : [...f.notify_on_types, t.value],
                            }))
                          }
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                            checked
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                              : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                          }`}
                        >
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">Leave all unchecked to receive all notification types</p>
                </div>

                <div className="mb-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={webhookForm.is_active}
                      onChange={(e) => setWebhookForm((f) => ({ ...f, is_active: e.target.checked }))}
                      className="w-4 h-4 accent-emerald-600 rounded"
                    />
                    <span className="text-sm text-gray-700">Active</span>
                  </label>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSaveWebhook}
                    className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    {editingWebhook ? 'Update Webhook' : 'Add Webhook'}
                  </button>
                  <button
                    onClick={() => { setShowWebhookForm(false); setEditingWebhook(null); }}
                    className="px-5 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="px-6 py-2">
              {webhooksLoading ? (
                <div className="py-8 text-center">
                  <i className="ri-loader-4-line animate-spin text-gray-400"></i>
                </div>
              ) : webhooks.length === 0 ? (
                <div className="py-8 text-center">
                  <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-2">
                    <i className="ri-links-line text-gray-300 text-xl"></i>
                  </div>
                  <p className="text-sm text-gray-400">No webhook integrations yet</p>
                  <p className="text-xs text-gray-300 mt-1">Add Slack, Discord, Telegram, or custom URLs</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {webhooks.map((wh) => (
                    <div key={wh.id} className="py-4 flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center">
                            <i className={`${PROVIDER_ICONS[wh.provider]} text-gray-400 text-sm`}></i>
                          </div>
                          <p className="text-sm font-semibold text-gray-800">{wh.name}</p>
                          <span
                            className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                              wh.is_active
                                ? 'bg-emerald-50 text-emerald-600'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {wh.is_active ? 'Active' : 'Paused'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1 truncate max-w-md">{wh.webhook_url}</p>
                        {wh.notify_on_types && wh.notify_on_types.length > 0 && (
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            {wh.notify_on_types.map((t) => (
                              <span key={t} className="text-[10px] bg-gray-50 text-gray-500 px-1.5 py-0.5 rounded">
                                {NOTIF_TYPES.find((n) => n.value === t)?.label || t}
                              </span>
                            ))}
                          </div>
                        )}
                        {(!wh.notify_on_types || wh.notify_on_types.length === 0) && (
                          <p className="text-[10px] text-gray-300 mt-1">All notification types</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleTestWebhook(wh)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-sky-50 text-gray-400 hover:text-sky-500 transition-colors cursor-pointer"
                          title="Test"
                        >
                          <i className="ri-send-plane-line text-sm"></i>
                        </button>
                        <button
                          onClick={() => handleToggleWebhook(wh)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-emerald-50 text-gray-400 hover:text-emerald-500 transition-colors cursor-pointer"
                          title={wh.is_active ? 'Pause' : 'Activate'}
                        >
                          <i className={`${wh.is_active ? 'ri-pause-circle-line' : 'ri-play-circle-line'} text-lg`}></i>
                        </button>
                        {showEdit && (
                          <button
                            onClick={() => openEditWebhook(wh)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                            title="Edit"
                          >
                            <i className="ri-edit-line text-sm"></i>
                          </button>
                        )}
                        {showDelete && (
                          <button
                            onClick={() => handleDeleteWebhook(wh.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                            title="Delete"
                          >
                            <i className="ri-delete-bin-line text-sm"></i>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <i className="ri-loader-4-line animate-spin"></i>
                Saving...
              </span>
            ) : (
              'Save Changes'
            )}
          </button>
          <button
            onClick={handleTestNotification}
            className="px-5 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap cursor-pointer"
          >
            Send Test Notification
          </button>
          <button
            onClick={async () => {
              const { data } = await api.functions.invoke('scheduled-dispatch', {
                body: {},
              });
              showToast(data?.message || 'Manual dispatch triggered');
              logAudit({ action: 'update', module: 'notifications', description: 'Manually triggered alert dispatch' });
            }}
            className="px-5 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap cursor-pointer"
          >
            Run Alert Dispatch
          </button>
          {isAdmin && (
            <button
              onClick={async () => {
                const { data } = await api.functions.invoke('alert-rules-evaluator', {
                  body: {},
                });
                showToast(`Evaluated ${data?.evaluated || 0} rules, created ${data?.total_created || 0} notifications`);
                logAudit({ action: 'update', module: 'notifications', description: `Manually evaluated alert rules (${data?.total_created || 0} notifications created)` });
              }}
              className="px-5 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap cursor-pointer"
            >
              Evaluate Rules Now
            </button>
          )}
        </div>

        {/* Status info */}
        <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-400 space-y-1">
          <p>
            <i className="ri-information-line mr-1"></i>
            Scheduled email dispatch runs automatically every 5 minutes.
          </p>
          <p>
            <i className="ri-information-line mr-1"></i>
            Browser push requires your permission and works for out-of-stock and low-stock alerts only.
          </p>
          {isAdmin && (
            <>
              <p>
                <i className="ri-information-line mr-1"></i>
                Custom alert rules are evaluated every 10 minutes via scheduled job.
              </p>
              <p>
                <i className="ri-information-line mr-1"></i>
                Webhooks fire automatically alongside other notification channels.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast.visible && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
            toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-500 text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <i
              className={`${
                toast.type === 'success' ? 'ri-check-line' : 'ri-error-warning-line'
              } text-base`}
            ></i>
            {toast.message}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}