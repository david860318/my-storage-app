<script setup>
import { ref, onMounted } from 'vue';
import { supabase } from '../supabase'; // 確保路徑指向你的 supabase.js

const loading = ref(true);
const profile = ref({
  username: '',
  phone: '',
  gender: '男',
  birthday: ''
});

// 1. 組件掛載後立即抓取資料
onMounted(async () => {
  await fetchUserProfile();
});

const fetchUserProfile = async () => {
  try {
    loading.value = true;
    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
      const { data, error } = await supabase
        .from('profiles')
        .select('username, phone, gender, birthday')
        .eq('id', session.user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      if (data) profile.value = data;
    }
  } catch (error) {
    console.error('Error loading profile:', error.message);
  } finally {
    loading.value = false;
  }
};

// 2. 更新資料至 Supabase
const updateProfile = async () => {
  try {
    loading.value = true;
    const { data: { session } } = await supabase.auth.getSession();

    const updates = {
      id: session.user.id,
      ...profile.value,
      updated_at: new Date(),
    };

    const { error } = await supabase.from('profiles').upsert(updates);

    if (error) throw error;
    alert('✅ 資料同步成功！');
  } catch (error) {
    alert('❌ 更新失敗：' + error.message);
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="page-container">
    <header class="page-header">
      <h1>👤 個人帳戶</h1>
    </header>

    <div v-if="loading && !profile.username" class="loading-placeholder">
      SYNCING_DATA...
    </div>

    <div v-else class="form-card">
      <div class="profile-visual">
        <div class="avatar-circle">
          <span class="avatar-icon">USR</span>
        </div>
        <div class="user-id-badge">
          <span class="status-dot"></span>
          ACTIVE_SESSION
        </div>
      </div>

      <div class="form-grid">
        <div class="field">
          <label>使用者名稱</label>
          <div class="input-group">
            <input v-model="profile.username" placeholder="輸入名稱..." />
            <div class="input-glow"></div>
          </div>
        </div>

        <div class="field">
          <label>聯絡電話</label>
          <div class="input-group">
            <input v-model="profile.phone" placeholder="09XX-XXX-XXX" />
            <div class="input-glow"></div>
          </div>
        </div>

        <div class="row">
          <div class="field">
            <label>性別</label>
            <select v-model="profile.gender" class="main-select">
              <option value="男">男</option>
              <option value="女">女</option>
              <option value="不便透露">不便透露</option>
            </select>
          </div>
          <div class="field">
            <label>生日</label>
            <input type="date" v-model="profile.birthday" class="date-input" />
          </div>
        </div>
      </div>

      <button @click="updateProfile" class="save-btn" :disabled="loading">
        <span class="btn-text">{{ loading ? 'SYNCING...' : '更新資料' }}</span>
        <div v-if="!loading" class="btn-shine"></div>
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 你原本的 CSS 保持不變，只需加入以下兩項優化 */
.loading-placeholder {
  color: var(--accent);
  font-family: monospace;
  text-align: center;
  padding: 50px;
  letter-spacing: 4px;
}

.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  filter: grayscale(1);
}

/* ... 以下維持你原本的 CSS ... */
.page-container { padding: 40px 5%; max-width: 700px; animation: fadeIn 0.5s ease-out; }
.page-header { margin-bottom: 40px; }
.subtitle { color: #888; font-size: 0.8rem; letter-spacing: 1px; margin-top: 8px; }
.form-card { background: var(--panel-bg); padding: 50px; border-radius: 24px; border: 1px solid var(--border-color); position: relative; overflow: hidden; backdrop-filter: blur(10px); }
.profile-visual { display: flex; flex-direction: column; align-items: center; margin-bottom: 40px; }
.avatar-circle { width: 100px; height: 100px; background: #000; border: 2px solid var(--accent); border-radius: 50%; display: flex; justify-content: center; align-items: center; box-shadow: 0 0 20px var(--accent-glow); margin-bottom: 15px; }
.avatar-icon { font-family: 'JetBrains Mono', monospace; font-weight: 900; color: var(--accent); font-size: 1.2rem; }
.user-id-badge { background: rgba(255, 255, 255, 0.05); padding: 4px 12px; border-radius: 20px; font-size: 0.65rem; font-family: 'JetBrains Mono', monospace; color: #888; display: flex; align-items: center; gap: 8px; }
.status-dot { width: 6px; height: 6px; background: #4ade80; border-radius: 50%; box-shadow: 0 0 8px #4ade80; }
.field { margin-bottom: 25px; }
.field label { display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 10px; letter-spacing: 2px; font-weight: bold; }
.input-group { position: relative; width: 100%; }
.input-group input, .main-select, .date-input { width: 100%; background: #000; border: 1px solid #222; padding: 14px 16px; border-radius: 10px; color: #fff; font-family: 'JetBrains Mono', monospace; transition: all 0.3s ease; z-index: 2; position: relative; }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.save-btn { width: 100%; background: var(--accent); color: #000; padding: 16px; border: none; border-radius: 12px; font-weight: 900; font-size: 1rem; letter-spacing: 2px; cursor: pointer; margin-top: 30px; position: relative; overflow: hidden; transition: 0.3s; }

.date-input {
    color-scheme: dark;
    cursor: pointer;
}
</style>