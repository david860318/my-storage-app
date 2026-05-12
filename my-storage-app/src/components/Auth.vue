<script setup>
import { ref } from 'vue';
import { supabase } from '../supabase';

const loading = ref(false);
const email = ref('');
const password = ref('');
const isSignUp = ref(false);

// 1. Google 登入邏輯
const handleGoogleLogin = async () => {
  try {
    loading.value = true;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // 這會導向到你目前開啟的網址
        redirectTo: window.location.origin 
      }
    });
    if (error) throw error;
  } catch (error) {
    alert('Google 登入失敗：' + error.message);
  } finally {
    loading.value = false;
  }
};

const handleAuth = async () => {
  try {
    loading.value = true;
    if (isSignUp.value) {
      const { error } = await supabase.auth.signUp({
        email: email.value,
        password: password.value,
      });
      if (error) throw error;
      alert('註冊成功！請檢查電子郵件驗證信。');
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.value,
        password: password.value,
      });
      if (error) throw error;
    }
  } catch (error) {
    alert(error.message);
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="auth-container">
    <div class="auth-card">
      <div class="auth-header">
        <h1>📦 MEMORIA</h1>
        <p>{{ isSignUp ? 'CREATE_ACCOUNT' : 'SYSTEM_LOGIN' }}</p>
      </div>
      
      <button @click="handleGoogleLogin" class="google-btn" :disabled="loading">
        <img src="https://www.google.com/favicon.ico" alt="Google" />
        使用 Google 帳號登入
      </button>

      <div class="divider">
        <span>OR</span>
      </div>

      <form @submit.prevent="handleAuth" class="auth-form">
        <div class="field">
          <label>EMAIL</label>
          <input v-model="email" type="email" placeholder="your@email.com" required />
        </div>
        <div class="field">
          <label>PASSWORD</label>
          <input v-model="password" type="password" placeholder="••••••••" required />
        </div>
        
        <button type="submit" class="auth-btn" :disabled="loading">
          {{ loading ? 'PROCESSING...' : (isSignUp ? 'SIGN UP' : 'LOGIN') }}
        </button>
      </form>

      <div class="auth-footer">
        <button @click="isSignUp = !isSignUp" class="switch-btn">
          {{ isSignUp ? '已有帳號？前往登入' : '還沒有帳號？點此註冊' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-container {
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--bg-dark);
  /* 加入微弱的背景發光 */
  background-image: 
    radial-gradient(circle at 50% -20%, rgba(192, 132, 252, 0.15), transparent),
    radial-gradient(circle at 0% 100%, rgba(192, 132, 252, 0.05), transparent);
  padding: 20px;
}

.auth-card {
  width: 100%;
  max-width: 420px;
  padding: 50px 40px;
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: 24px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(20px);
  animation: cardAppear 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.auth-header {
  text-align: center;
  margin-bottom: 35px;
}

.auth-header h1 {
  font-size: 2.2rem;
  letter-spacing: 6px;
  color: #fff;
  margin-bottom: 10px;
  text-shadow: 0 0 20px var(--accent-glow);
}

.auth-header p {
  font-size: 0.75rem;
  color: var(--accent);
  letter-spacing: 3px;
  font-family: 'JetBrains Mono', monospace;
  opacity: 0.8;
}

/* Google 按鈕科技化優化 */
.google-btn {
  width: 100%;
  padding: 14px;
  background: #fff;
  color: #000;
  border: none;
  border-radius: 12px;
  font-weight: 800;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  transition: all 0.3s ease;
  font-size: 0.9rem;
}

.google-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 5px 20px rgba(255, 255, 255, 0.2);
  filter: brightness(1.05);
}

.google-btn:active { transform: translateY(0); }

.google-btn img { width: 18px; height: 18px; }

/* 分隔線美化 */
.divider {
  display: flex;
  align-items: center;
  margin: 30px 0;
  color: #444;
  font-size: 0.65rem;
  letter-spacing: 4px;
  font-family: 'JetBrains Mono', monospace;
}

.divider::before, .divider::after {
  content: "";
  flex: 1;
  height: 1px;
  background: linear-gradient(to var(--direction, right), transparent, #333);
}
.divider::before { --direction: right; }
.divider::after { --direction: left; }

.divider span { padding: 0 20px; }

/* 表單欄位優化 */
.auth-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.field label {
  display: block;
  font-size: 0.7rem;
  color: var(--accent);
  margin-bottom: 8px;
  letter-spacing: 1.5px;
  font-weight: bold;
}

.field input {
  width: 100%;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid #222;
  color: #fff;
  padding: 14px 16px;
  border-radius: 10px;
  font-family: 'JetBrains Mono', monospace;
  transition: all 0.3s ease;
}

.field input:focus {
  outline: none;
  border-color: var(--accent);
  background: #000;
  box-shadow: 0 0 15px rgba(192, 132, 252, 0.15);
}

.auth-btn {
  background: var(--accent);
  color: #000;
  padding: 16px;
  border: none;
  border-radius: 12px;
  font-weight: 900;
  cursor: pointer;
  margin-top: 10px;
  letter-spacing: 2px;
  transition: all 0.3s ease;
  box-shadow: 0 0 20px var(--accent-glow);
}

.auth-btn:hover {
  filter: brightness(1.1);
  transform: translateY(-2px);
  box-shadow: 0 0 30px var(--accent-glow);
}

.auth-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none !important;
}

/* 下方切換按鈕 */
.auth-footer {
  margin-top: 35px;
  text-align: center;
}

.switch-btn {
  background: transparent;
  border: none;
  color: #666;
  font-size: 0.8rem;
  cursor: pointer;
  transition: color 0.3s ease;
  font-family: 'Inter', sans-serif;
}

.switch-btn:hover {
  color: var(--accent);
}

/* 進場動畫 */
@keyframes cardAppear {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 響應式優化 */
@media (max-width: 480px) {
  .auth-card {
    padding: 40px 25px;
    border: none;
    background: transparent;
    box-shadow: none;
  }
}
</style>