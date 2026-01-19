import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import { enable as enableAutostart, disable as disableAutostart, isEnabled as isAutostartEnabled } from '@tauri-apps/plugin-autostart';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import type { WaterEntry, DailyStats, MonthlyStats, Settings, Tab } from './types';

// Icons
// Ink Ribbon Icon
const InkRibbonIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
  </svg>
);

const ChartIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const ChevronLeftIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const TrendingUpIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
);


const defaultSettings: Settings = {
  daily_goal_ml: 4000,
  reminder_interval_minutes: 60,
  reminder_enabled: true,
  sound_enabled: true,
  start_with_system: false,
  theme: 'dark',
};

// Sound Effects Utility - RE2/RE3 OG Menu Sounds
const playSound = (type: 'typewriter' | 'add' | 'delete' | 'achievement' | 'error' | 'move', enabled: boolean) => {
  if (!enabled) {
    return;
  }
  
  try {
    let soundFile = '';
    
    switch (type) {
      case 'typewriter':
      case 'add':
        // Use Select.wav for button clicks and adding items
        soundFile = '/sounds/Select.wav';
        break;
      case 'move':
        // Use Move.wav for navigation/moving between items
        soundFile = '/sounds/Move.wav';
        break;
      case 'delete':
      case 'error':
        // Use Back.wav for delete/back/error actions
        soundFile = '/sounds/Back.wav';
        break;
      case 'achievement':
        // Use Select.wav for achievement (more celebratory)
        soundFile = '/sounds/Select.wav';
        break;
    }
    
    if (soundFile) {
      const audio = new Audio(soundFile);
      audio.volume = 0.7; // Set volume to 70%
      audio.play().catch((err) => {
        console.error('Failed to play sound:', err);
      });
    }
  } catch (error) {
    console.error('Error playing sound:', error);
  }
};

function App() {
  const [tab, setTab] = useState<Tab>('today');
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [entries, setEntries] = useState<WaterEntry[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [customAmount, setCustomAmount] = useState('');
  const [toast, setToast] = useState<{ message: string; show: boolean }>({ message: '', show: false });
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  
  const [achievement, setAchievement] = useState<{ show: boolean; message: string }>({
    show: false,
    message: '',
  });
  
  const reminderInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const achievementTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load data
  const loadData = useCallback(async () => {
    try {
      const [todayStats, todayEntries, savedSettings] = await Promise.all([
        invoke<DailyStats>('get_today_stats'),
        invoke<WaterEntry[]>('get_today_entries'),
        invoke<Settings>('get_settings'),
      ]);
      setStats(todayStats);
      setEntries(todayEntries);
      
      // Sync autostart state with actual system state
      try {
        const autostartEnabled = await isAutostartEnabled();
        if (savedSettings.start_with_system !== autostartEnabled) {
          savedSettings.start_with_system = autostartEnabled;
          // Update database to match actual state
          await invoke('save_settings', { settings: savedSettings });
        }
      } catch (error) {
        console.error('Failed to check autostart status:', error);
      }
      
      setSettings(savedSettings);
      
      // Apply theme
      document.documentElement.setAttribute('data-theme', savedSettings.theme);
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  }, []);

  // Load monthly stats
  const loadMonthlyStats = useCallback(async () => {
    try {
      const data = await invoke<MonthlyStats>('get_monthly_stats', {
        year: selectedMonth.year,
        month: selectedMonth.month,
      });
      setMonthlyStats(data);
    } catch (error) {
      console.error('Failed to load monthly stats:', error);
    }
  }, [selectedMonth]);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load monthly stats when tab changes
  useEffect(() => {
    if (tab === 'analytics') {
      loadMonthlyStats();
    }
  }, [tab, loadMonthlyStats]);

  // Listen for quick-add events from system tray
  useEffect(() => {
    const unlisten = listen<number>('quick-add', (event) => {
      handleAddWater(event.payload);
    });
    
    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  // Setup reminder system
  useEffect(() => {
    const setupReminder = async () => {
      if (!settings.reminder_enabled) {
        if (reminderInterval.current) {
          clearInterval(reminderInterval.current);
          reminderInterval.current = null;
        }
        return;
      }

      // Check notification permission
      let permissionGranted = await isPermissionGranted();
      console.log('Current notification permission:', permissionGranted);
      
      if (!permissionGranted) {
        console.log('Requesting notification permission...');
        const permission = await requestPermission();
        permissionGranted = permission === 'granted';
        console.log('Permission request result:', permission, 'Granted:', permissionGranted);
      }

      if (!permissionGranted) {
        console.warn('Notification permission not granted. Reminders will not work.');
        setToast({ message: 'Notification permission required for reminders! Check system settings.', show: true });
        setTimeout(() => setToast({ message: '', show: false }), 5000);
        return;
      }
      
      console.log('Notification permission granted. Setting up reminders...');

      // Clear existing interval
      if (reminderInterval.current) {
        clearInterval(reminderInterval.current);
        reminderInterval.current = null;
      }

      // Calculate interval in milliseconds
      const intervalMs = settings.reminder_interval_minutes * 60 * 1000;
      console.log(`Setting reminder interval: ${settings.reminder_interval_minutes} minutes (${intervalMs}ms)`);

      // Send test notification immediately to verify it works (after a short delay to ensure system is ready)
      setTimeout(async () => {
        try {
          console.log('Sending test notification...');
          const result = await sendNotification({
            title: '💧 Hydration Reminder',
            body: 'Reminder system active! You will be notified every ' + settings.reminder_interval_minutes + ' minutes.',
          });
          console.log('✅ Test notification sent successfully!', result);
          
          // Also test sound for notification
          playSound('add', settings.sound_enabled);
        } catch (error) {
          console.error('❌ Failed to send test notification:', error);
          console.error('Error details:', JSON.stringify(error, null, 2));
        }
      }, 2000);

      // Set new interval
      reminderInterval.current = setInterval(async () => {
        try {
          console.log('⏰ Reminder interval triggered at', new Date().toLocaleTimeString());
          const result = await sendNotification({
            title: '💧 Hydration Reminder',
            body: 'Time to drink some water! Stay hydrated.',
          });
          console.log('✅ Reminder notification sent successfully!', result);
          
          // Play notification sound
          playSound('add', settings.sound_enabled);
        } catch (error) {
          console.error('❌ Failed to send reminder notification:', error);
          console.error('Error details:', JSON.stringify(error, null, 2));
        }
      }, intervalMs);
    };

    setupReminder();

    return () => {
      if (reminderInterval.current) {
        clearInterval(reminderInterval.current);
      }
      if (achievementTimeout.current) {
        clearTimeout(achievementTimeout.current);
      }
    };
  }, [settings.reminder_enabled, settings.reminder_interval_minutes]);

  // Add water
  const handleAddWater = async (amount: number) => {
    if (amount <= 0) {
      playSound('error', settings.sound_enabled);
      return;
    }
    
    try {
      playSound('add', settings.sound_enabled);
      await invoke('add_water', { amountMl: amount });
      const [updatedStats] = await Promise.all([
        invoke<DailyStats>('get_today_stats'),
        invoke<WaterEntry[]>('get_today_entries'),
      ]);
      
      // Check for achievement (reaching 100%)
      if (!achievement.show && updatedStats.percentage >= 100 && stats && stats.percentage < 100) {
        setAchievement({
          show: true,
          message: 'FIRST AID SPRAY\nACHIEVEMENT UNLOCKED',
        });
        playSound('achievement', settings.sound_enabled);
        
        if (achievementTimeout.current) {
          clearTimeout(achievementTimeout.current);
        }
        achievementTimeout.current = setTimeout(() => {
          setAchievement({ show: false, message: '' });
        }, 5000);
      }
      
      await loadData();
      showToast(`Added ${amount}ml`);
      setCustomAmount('');
    } catch (error) {
      console.error('Failed to add water:', error);
      playSound('error', settings.sound_enabled);
    }
  };

  // Remove entry
  const handleRemoveEntry = async (id: number) => {
    try {
      playSound('delete', settings.sound_enabled);
      await invoke('remove_entry', { id });
      await loadData();
    } catch (error) {
      console.error('Failed to remove entry:', error);
      playSound('error', settings.sound_enabled);
    }
  };

  // Save settings
  const handleSaveSettings = async (newSettings: Partial<Settings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    
    if (newSettings.theme) {
      document.documentElement.setAttribute('data-theme', newSettings.theme);
    }
    
    // Handle autostart
    if (newSettings.start_with_system !== undefined) {
      try {
        if (newSettings.start_with_system) {
          await enableAutostart();
          console.log('Autostart enabled');
        } else {
          await disableAutostart();
          console.log('Autostart disabled');
        }
      } catch (error) {
        console.error('Failed to update autostart:', error);
        showToast('Failed to update autostart setting');
      }
    }
    
    try {
      await invoke('save_settings', { settings: updated });
      await loadData();
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  // Show toast
  const showToast = (message: string) => {
    setToast({ message, show: true });
    setTimeout(() => setToast({ message: '', show: false }), 2000);
  };

  // Format time
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Navigate months
  const navigateMonth = (direction: number) => {
    setSelectedMonth(prev => {
      let newMonth = prev.month + direction;
      let newYear = prev.year;
      
      if (newMonth > 12) {
        newMonth = 1;
        newYear++;
      } else if (newMonth < 1) {
        newMonth = 12;
        newYear--;
      }
      
      return { year: newYear, month: newMonth };
    });
  };

  // Calculate progress ring
  const circumference = 2 * Math.PI * 88;
  const progress = stats ? Math.min(stats.percentage / 100, 1) : 0;
  const strokeDashoffset = circumference * (1 - progress);

  // Health Status System (Resident Evil style)
  const getHealthStatus = (percentage: number): 'fine' | 'caution' | 'danger' => {
    if (percentage >= 75) return 'fine';
    if (percentage >= 40) return 'caution';
    return 'danger';
  };

  const healthStatus = stats ? getHealthStatus(stats.percentage) : 'danger';
  const healthStatusText = healthStatus === 'fine' ? 'FINE' : healthStatus === 'caution' ? 'CAUTION' : 'DANGER';

  // ECG Animation Component
  const ECGAnimation = ({ healthStatus }: { healthStatus: 'fine' | 'caution' | 'danger' }) => {
    const ecgColor = healthStatus === 'fine' ? '#4ade80' : healthStatus === 'caution' ? '#fbbf24' : '#dc2626';
    const ecgGlow = healthStatus === 'fine' ? 'rgba(74, 222, 128, 0.4)' : healthStatus === 'caution' ? 'rgba(251, 191, 36, 0.4)' : 'rgba(220, 38, 38, 0.4)';
    
    return (
      <div className="ecg-container">
        <svg className="ecg-line" viewBox="0 0 800 60" preserveAspectRatio="none">
          <path
            className="ecg-path"
            d="M0,30 L40,30 L45,10 L50,50 L55,20 L60,40 L65,30 L100,30 L105,15 L110,45 L115,25 L120,35 L125,30 L160,30 L165,10 L170,50 L175,20 L180,40 L185,30 L220,30 L225,15 L230,45 L235,25 L240,35 L245,30 L280,30 L285,10 L290,50 L295,20 L300,40 L305,30 L340,30 L345,15 L350,45 L355,25 L360,35 L365,30 L400,30 L440,30 L445,10 L450,50 L455,20 L460,40 L465,30 L500,30 L505,15 L510,45 L515,25 L520,35 L525,30 L560,30 L565,10 L570,50 L575,20 L580,40 L585,30 L620,30 L625,15 L630,45 L635,25 L640,35 L645,30 L680,30 L685,10 L690,50 L695,20 L700,40 L705,30 L740,30 L745,15 L750,45 L755,25 L760,35 L765,30 L800,30"
            style={{
              stroke: ecgColor,
              filter: `drop-shadow(0 0 4px ${ecgGlow})`
            }}
          />
        </svg>
      </div>
    );
  };

  // Quick add amounts
  const quickAmounts = [250, 500, 750, 1000];

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <div className="logo">
            <div 
              className="logo-icon" 
              style={{
                background: stats ? (
                  getHealthStatus(stats.percentage) === 'fine' ? 'var(--status-fine)' :
                  getHealthStatus(stats.percentage) === 'caution' ? 'var(--status-caution)' :
                  'var(--status-danger)'
                ) : 'var(--status-danger)',
                boxShadow: stats ? (
                  getHealthStatus(stats.percentage) === 'fine' ? '0 0 20px var(--re-green-glow)' :
                  getHealthStatus(stats.percentage) === 'caution' ? '0 0 20px var(--biohazard-yellow-glow)' :
                  '0 0 20px var(--blood-red-glow)'
                ) : '0 0 20px var(--blood-red-glow)'
              }}
            >
              <img 
                src={stats ? (getHealthStatus(stats.percentage) === 'fine' ? '/green-herb.png' : getHealthStatus(stats.percentage) === 'caution' ? '/yellow-herb.png' : '/red-herb.png') : '/red-herb.png'} 
                alt="Health Status Herb"
                className="logo-herb-image"
              />
            </div>
            <span className={`logo-text status-${stats ? getHealthStatus(stats.percentage) : 'danger'}`}>HEALTH STATUS</span>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="nav">
            <button
              className={`nav-btn ${tab === 'today' ? 'active' : ''}`}
              onClick={() => {
                playSound('move', settings.sound_enabled);
                setTab('today');
              }}
            >
              Today
            </button>
            <button
              className={`nav-btn ${tab === 'analytics' ? 'active' : ''}`}
              onClick={() => {
                playSound('move', settings.sound_enabled);
                setTab('analytics');
              }}
            >
              Analytics
            </button>
            <button
              className={`nav-btn ${tab === 'settings' ? 'active' : ''}`}
              onClick={() => {
                playSound('move', settings.sound_enabled);
                setTab('settings');
              }}
            >
              Settings
            </button>
      </nav>

      {/* Main content */}
      <main 
        className="main" 
        style={{
          backgroundColor: stats && tab === 'today' ? (
            getHealthStatus(stats.percentage) === 'fine' ? 'rgba(74, 222, 128, 0.03)' :
            getHealthStatus(stats.percentage) === 'caution' ? 'rgba(251, 191, 36, 0.03)' :
            'rgba(220, 38, 38, 0.03)'
          ) : 'transparent',
          transition: 'background-color 0.5s ease'
        }}
      >
        {tab === 'today' && stats && (
          <>
            {/* Progress ring - T-Virus Container Style */}
            <div className="progress-section">
              <div className="progress-ring-container">
                <svg className="progress-ring" width="200" height="200">
                  <circle
                    className="progress-ring-bg"
                    cx="100"
                    cy="100"
                    r="88"
                  />
                  <circle
                    className="progress-ring-fill"
                    cx="100"
                    cy="100"
                    r="88"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    style={{
                      stroke: healthStatus === 'fine' ? '#4ade80' : healthStatus === 'caution' ? '#fbbf24' : '#dc2626',
                      filter: `drop-shadow(0 0 8px ${healthStatus === 'fine' ? 'rgba(74, 222, 128, 0.4)' : healthStatus === 'caution' ? 'rgba(251, 191, 36, 0.4)' : 'rgba(220, 38, 38, 0.4)'})`
                    }}
                  />
                </svg>
                <div className="progress-content">
                  <div 
                    className="progress-amount"
                    style={{
                      color: healthStatus === 'fine' ? '#4ade80' : healthStatus === 'caution' ? '#fbbf24' : '#dc2626',
                      textShadow: `0 0 10px ${healthStatus === 'fine' ? 'rgba(74, 222, 128, 0.6)' : healthStatus === 'caution' ? 'rgba(251, 191, 36, 0.6)' : 'rgba(220, 38, 38, 0.6)'}`
                    }}
                  >
                    {(stats.total_ml / 1000).toFixed(1)}
                    <span className="progress-unit">L</span>
                  </div>
                  <div className="progress-goal">
                    of {(stats.goal_ml / 1000).toFixed(1)}L goal
                  </div>
                  <div 
                    className="progress-percentage"
                    style={{
                      color: healthStatus === 'fine' ? '#4ade80' : healthStatus === 'caution' ? '#fbbf24' : '#dc2626',
                      textShadow: `0 0 8px ${healthStatus === 'fine' ? 'rgba(74, 222, 128, 0.6)' : healthStatus === 'caution' ? 'rgba(251, 191, 36, 0.6)' : 'rgba(220, 38, 38, 0.6)'}`
                    }}
                  >
                    {Math.round(stats.percentage)}%
                  </div>
                </div>
              </div>
              
              {/* Health Status Badge */}
              <div className={`health-status ${healthStatus}`} style={{ 
                marginTop: '16px',
                color: healthStatus === 'fine' ? '#4ade80' : healthStatus === 'caution' ? '#fbbf24' : '#dc2626'
              }}>
                {healthStatusText}
              </div>

            </div>

            {/* ECG Heartbeat Animation */}
            <ECGAnimation healthStatus={healthStatus} />

            {/* Quick add buttons */}
            <div className="quick-add">
              {quickAmounts.map(amount => (
                <button
                  key={amount}
                  className="quick-btn"
                  onClick={() => {
                    handleAddWater(amount);
                  }}
                >
                  <span className="quick-btn-amount">{amount}</span>
                  <span className="quick-btn-label">ml</span>
                </button>
              ))}
            </div>

            {/* Custom input */}
            <div className="custom-input-section">
              <div className="custom-input-wrapper">
                <input
                  type="number"
                  className="custom-input"
                  placeholder="Custom amount"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAddWater(parseInt(customAmount) || 0);
                    }
                  }}
                />
                <span className="custom-input-unit">ml</span>
              </div>
              <button
                className="add-btn"
                onClick={() => {
                  handleAddWater(parseInt(customAmount) || 0);
                }}
                disabled={!customAmount || parseInt(customAmount) <= 0}
              >
                Add
              </button>
            </div>

            {/* Stats cards */}
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">Entries</div>
                <div className="stat-value">{stats.entries_count}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Remaining</div>
                <div className={`stat-value ${stats.total_ml >= stats.goal_ml ? 'success' : ''}`}>
                  {stats.total_ml >= stats.goal_ml 
                    ? '✓ Done' 
                    : `${((stats.goal_ml - stats.total_ml) / 1000).toFixed(1)}L`}
                </div>
              </div>
            </div>

            {/* Today's entries - Inventory Grid Style */}
            <div className="entries-section">
              <div className="ink-ribbon">
                <div className="ink-ribbon-icon">
                  <InkRibbonIcon />
                </div>
              </div>
              <div className="section-header">
                <span className="section-title">INVENTORY</span>
              </div>
              {entries.length > 0 ? (
                <div className="entries-list">
                  {entries.map(entry => (
                    <div key={entry.id} className="entry-item">
                      <div className="entry-info">
                        <div className="entry-icon">
                          <img 
                            src="/green-herb.png" 
                            alt="Green Herb"
                            className="entry-herb-image"
                          />
                        </div>
                        <div className="entry-details">
                          <div className="entry-amount">{entry.amount_ml}ml</div>
                          <div className="entry-time">{formatTime(entry.timestamp)}</div>
                        </div>
                      </div>
                      <button
                        className="entry-delete"
                        onClick={() => handleRemoveEntry(entry.id)}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <p>No items in inventory</p>
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'analytics' && (
          <>
            {/* Month navigation */}
            <div className="analytics-header">
              <div className="month-nav">
                <button 
                  className="month-nav-btn" 
                  onClick={() => {
                    playSound('move', settings.sound_enabled);
                    navigateMonth(-1);
                  }}
                >
                  <ChevronLeftIcon />
                </button>
                <span className="month-label">
                  {monthlyStats?.month} {monthlyStats?.year}
                </span>
                <button 
                  className="month-nav-btn" 
                  onClick={() => {
                    playSound('move', settings.sound_enabled);
                    navigateMonth(1);
                  }}
                >
                  <ChevronRightIcon />
                </button>
              </div>
            </div>

            {/* Chart */}
            {monthlyStats && monthlyStats.days.length > 0 && (
              <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={monthlyStats.days.map(d => ({
                      day: parseInt(d.date.split('-')[2]),
                      amount: d.total_ml / 1000,
                      goal: d.goal_ml / 1000,
                    }))}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <XAxis
                      dataKey="day"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 10 }}
                      tickFormatter={(value) => `${value}L`}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                      formatter={(value: number) => [`${value.toFixed(1)}L`, 'Intake']}
                      labelFormatter={(label) => `Day ${label}`}
                    />
                    <ReferenceLine
                      y={settings.daily_goal_ml / 1000}
                      stroke="var(--accent-primary)"
                      strokeDasharray="5 5"
                      strokeOpacity={0.5}
                    />
                    <Bar
                      dataKey="amount"
                      fill="url(#barGradient)"
                      radius={[4, 4, 0, 0]}
                    />
                    <defs>
                      <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#06b6d4" />
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Monthly stats */}
            {monthlyStats && (
              <div className="monthly-stats">
                <div className="monthly-stat">
                  <div className="monthly-stat-icon blue">
                    <img 
                      src="/green-herb.png" 
                      alt="Green Herb"
                      className="monthly-stat-herb-image"
                    />
                  </div>
                  <div className="monthly-stat-value">
                    {(monthlyStats.total_ml / 1000).toFixed(1)}L
                  </div>
                  <div className="monthly-stat-label">Total Intake</div>
                </div>
                <div className="monthly-stat">
                  <div className="monthly-stat-icon green">
                    <TrendingUpIcon />
                  </div>
                  <div className="monthly-stat-value">
                    {(monthlyStats.average_ml / 1000).toFixed(1)}L
                  </div>
                  <div className="monthly-stat-label">Daily Average</div>
                </div>
                <div className="monthly-stat">
                  <div className="monthly-stat-icon orange">
                    <img 
                      src="/queens-grail.png" 
                      alt="Queen's Grail"
                      className="monthly-stat-herb-image"
                    />
                  </div>
                  <div className="monthly-stat-value">
                    {monthlyStats.days_goal_met}
                  </div>
                  <div className="monthly-stat-label">Goals Met</div>
                </div>
                <div className="monthly-stat">
                  <div className="monthly-stat-icon purple">
                    <img 
                      src="/dynamite.png" 
                      alt="Dynamite"
                      className="monthly-stat-herb-image"
                    />
                  </div>
                  <div className="monthly-stat-value">
                    {monthlyStats.current_streak}
                  </div>
                  <div className="monthly-stat-label">Current Streak</div>
                </div>
              </div>
            )}

            {monthlyStats && monthlyStats.days.length === 0 && (
              <div className="empty-state">
                <ChartIcon />
                <p>No data for this month</p>
              </div>
            )}
          </>
        )}

        {tab === 'settings' && (
          <>
            {/* Goal settings */}
            <div className="settings-section">
              <div className="settings-title">Daily Goal</div>
              <div className="settings-card">
                <div className="setting-item">
                  <div className="setting-info">
                    <div className="setting-label">Water Goal</div>
                    <div className="setting-description">Your daily hydration target</div>
                  </div>
                  <div className="setting-control">
                    <input
                      type="number"
                      className="setting-input"
                      value={settings.daily_goal_ml}
                      onChange={(e) => handleSaveSettings({ daily_goal_ml: parseInt(e.target.value) || 0 })}
                      step="100"
                      min="0"
                    />
                    <span className="setting-unit">ml</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Reminder settings */}
            <div className="settings-section">
              <div className="settings-title">Reminders</div>
              <div className="settings-card">
                <div className="setting-item">
                  <div className="setting-info">
                    <div className="setting-label">Enable Reminders</div>
                    <div className="setting-description">Get notified to drink water</div>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={settings.reminder_enabled}
                      onChange={(e) => handleSaveSettings({ reminder_enabled: e.target.checked })}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
                <div className="setting-item">
                  <div className="setting-info">
                    <div className="setting-label">Reminder Interval</div>
                    <div className="setting-description">How often to remind you</div>
                  </div>
                  <div className="setting-control">
                    <input
                      type="number"
                      className="setting-input"
                      value={settings.reminder_interval_minutes}
                      onChange={(e) => handleSaveSettings({ reminder_interval_minutes: parseInt(e.target.value) || 60 })}
                      step="15"
                      min="15"
                      disabled={!settings.reminder_enabled}
                    />
                    <span className="setting-unit">min</span>
                  </div>
                </div>
                <div className="setting-item">
                  <div className="setting-info">
                    <div className="setting-label">Sound</div>
                    <div className="setting-description">Play sound with notifications</div>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={settings.sound_enabled}
                      onChange={(e) => handleSaveSettings({ sound_enabled: e.target.checked })}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>
            </div>

            {/* Appearance settings */}
            <div className="settings-section">
              <div className="settings-title">Appearance</div>
              <div className="settings-card">
                <div className="setting-item">
                  <div className="setting-info">
                    <div className="setting-label">Theme</div>
                    <div className="setting-description">Choose your preferred theme</div>
                  </div>
                  <select
                    className="setting-select"
                    value={settings.theme}
                    onChange={(e) => handleSaveSettings({ theme: e.target.value })}
                  >
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                  </select>
                </div>
              </div>
            </div>

            {/* System settings */}
            <div className="settings-section">
              <div className="settings-title">System</div>
              <div className="settings-card">
                <div className="setting-item">
                  <div className="setting-info">
                    <div className="setting-label">Start with System</div>
                    <div className="setting-description">Launch app on system startup</div>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={settings.start_with_system}
                      onChange={(e) => handleSaveSettings({ start_with_system: e.target.checked })}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Toast notification */}
      <div className={`toast success ${toast.show ? 'show' : ''}`}>
        <CheckIcon />
        <span className="toast-message">{toast.message}</span>
      </div>

      {/* Achievement Notification */}
      <div className={`achievement ${achievement.show ? 'show' : ''}`}>
        <div className="achievement-content">
          <div className="achievement-icon">
            <img 
              src="/first-aid-spray.png" 
              alt="First Aid Spray"
              className="achievement-first-aid-image"
            />
          </div>
          <div className="achievement-title">ACHIEVEMENT</div>
          <div className="achievement-message">{achievement.message}</div>
        </div>
      </div>
    </div>
  );
}

export default App;
