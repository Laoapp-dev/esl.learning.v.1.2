@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 48 14% 95%;
    --foreground: 240 29% 14%;
    --card: 0 0% 100%;
    --card-foreground: 240 29% 14%;
    --popover: 0 0% 100%;
    --popover-foreground: 240 29% 14%;
    --primary: 38 90% 55%;
    --primary-foreground: 0 0% 100%;
    --secondary: 48 10% 92%;
    --secondary-foreground: 240 29% 14%;
    --muted: 48 10% 92%;
    --muted-foreground: 240 8% 46%;
    --accent: 48 10% 92%;
    --accent-foreground: 240 29% 14%;
    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 98%;
    --border: 48 10% 88%;
    --input: 48 10% 88%;
    --ring: 38 90% 55%;
    --radius: 0.625rem;
    --sidebar-background: 240 29% 14%;
    --sidebar-foreground: 0 0% 100%;
    --sidebar-primary: 38 90% 55%;
    --sidebar-primary-foreground: 0 0% 100%;
    --sidebar-accent: 240 29% 20%;
    --sidebar-accent-foreground: 0 0% 100%;
    --sidebar-border: 240 29% 20%;
    --sidebar-ring: 38 90% 55%;
  }

  .dark {
    --background: 240 29% 8%;
    --foreground: 48 14% 92%;
    --card: 240 29% 12%;
    --card-foreground: 48 14% 92%;
    --popover: 240 29% 12%;
    --popover-foreground: 48 14% 92%;
    --primary: 38 90% 55%;
    --primary-foreground: 240 29% 8%;
    --secondary: 240 29% 16%;
    --secondary-foreground: 48 14% 92%;
    --muted: 240 29% 16%;
    --muted-foreground: 240 8% 60%;
    --accent: 240 29% 16%;
    --accent-foreground: 48 14% 92%;
    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 29% 20%;
    --input: 240 29% 20%;
    --ring: 38 90% 55%;
    --sidebar-background: 240 29% 6%;
    --sidebar-foreground: 0 0% 100%;
    --sidebar-primary: 38 90% 55%;
    --sidebar-primary-foreground: 0 0% 100%;
    --sidebar-accent: 240 29% 14%;
    --sidebar-accent-foreground: 0 0% 100%;
    --sidebar-border: 240 29% 14%;
    --sidebar-ring: 38 90% 55%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground font-sans antialiased;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  }
}

/* Dot grid background pattern */
.dot-grid-bg {
  background-color: #F5F5F0;
  background-image: radial-gradient(circle, #1A1A2E 1px, transparent 1px);
  background-size: 24px 24px;
  background-position: center center;
}

.dark .dot-grid-bg {
  background-color: #0e0e1a;
  background-image: radial-gradient(circle, #4a4a6a 1px, transparent 1px);
}

/* Flashcard flip animation */
.flashcard-container {
  perspective: 1000px;
}

.flashcard-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  transform-style: preserve-3d;
}

.flashcard-inner.flipped {
  transform: rotateY(180deg);
}

.flashcard-front,
.flashcard-back {
  position: absolute;
  width: 100%;
  height: 100%;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.flashcard-back {
  transform: rotateY(180deg);
}

/* Matching card flip */
.matching-card-container {
  perspective: 600px;
}

.matching-card-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transition: transform 0.3s ease;
  transform-style: preserve-3d;
}

.matching-card-inner.flipped {
  transform: rotateY(180deg);
}

.matching-card-inner.matched {
  transform: rotateY(180deg);
}

.matching-card-front,
.matching-card-back {
  position: absolute;
  width: 100%;
  height: 100%;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.matching-card-back {
  transform: rotateY(180deg);
}

/* Custom scrollbar */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: #D5D5CD;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: #B5B5AD;
}

/* Animations */
@keyframes slideInRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideOutRight {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(100%);
    opacity: 0;
  }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes confetti-fall {
  0% {
    transform: translateY(-100vh) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translateY(100vh) rotate(720deg);
    opacity: 0;
  }
}

.animate-slide-in-right {
  animation: slideInRight 0.3s ease forwards;
}

.animate-fade-in {
  animation: fadeIn 0.25s ease forwards;
}

.animate-fade-in-up {
  animation: fadeInUp 0.25s ease forwards;
}

.animate-scale-in {
  animation: scaleIn 0.2s ease-out forwards;
}

.animate-pulse-slow {
  animation: pulse 1.5s ease-in-out infinite;
}

/* Toast progress bar */
.toast-progress {
  animation: shrink 3s linear forwards;
}

@keyframes shrink {
  from { width: 100%; }
  to { width: 0%; }
}

/* Card hover effect */
.card-hover {
  transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
}

.card-hover:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border-color: #D5D5CD;
}

/* Button press effect */
.btn-press {
  transition: transform 0.1s ease, background-color 0.15s ease;
}

.btn-press:active {
  transform: scale(0.97);
}

/* Study option button */
.option-btn {
  transition: all 0.15s ease;
}

.option-btn:hover {
  background-color: #FFF3DD;
  border-color: #F5A623;
}

.option-btn.selected {
  background-color: #FFF3DD;
  border-color: #F5A623;
}

.option-btn.correct {
  background-color: #34C759;
  border-color: #34C759;
  color: white;
}

.option-btn.wrong {
  background-color: #FF3B30;
  border-color: #FF3B30;
  color: white;
}

/* Confetti */
.confetti-piece {
  position: absolute;
  width: 10px;
  height: 10px;
  animation: confetti-fall 3s ease-in forwards;
}

/* Activity calendar grid */
.activity-cell {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

/* Focus styles */
input:focus, textarea:focus, select:focus {
  outline: none;
  border-color: #F5A623;
  box-shadow: 0 0 0 3px rgba(245, 166, 35, 0.15);
}

/* Responsive sidebar */
@media (max-width: 768px) {
  .sidebar-desktop {
    display: none;
  }
  .main-content {
    padding-bottom: 80px;
  }
}

@media (min-width: 769px) {
  .sidebar-mobile {
    display: none;
  }
}

/* ── PWA / Mobile safe-area & touch improvements ────────────────── */

/* Respect the iPhone notch and Android gesture nav bar */
:root {
  --safe-area-bottom: env(safe-area-inset-bottom, 0px);
  --safe-area-top: env(safe-area-inset-top, 0px);
}

/* Prevent rubber-band / over-scroll on iOS when app is installed */
html, body, #root {
  height: 100%;
  overscroll-behavior: none;
}

/* Ensure body fills screen edge-to-edge on installed PWA */
body {
  padding-top: env(safe-area-inset-top);
}

/* Remove tap highlight on interactive elements (looks more native) */
button, a, [role="button"] {
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

/* Larger touch targets on mobile (min 44px per Apple HIG) */
@media (max-width: 768px) {
  button, a {
    min-height: 44px;
  }
}

/* Bottom nav safe-area padding applied via component class */
.mobile-nav-safe {
  padding-bottom: max(8px, env(safe-area-inset-bottom));
}

/* Main content bottom clearance for the mobile nav bar */
.main-content-mobile-pad {
  padding-bottom: calc(72px + env(safe-area-inset-bottom));
}

/* ── Dark Mode Overrides ─────────────────────────────────────────── */
.dark .card-hover:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  border-color: hsl(var(--border));
}

.dark ::-webkit-scrollbar-thumb {
  background: #3a3a5c;
}

.dark ::-webkit-scrollbar-thumb:hover {
  background: #5a5a8c;
}

.dark input, .dark textarea, .dark select {
  background-color: hsl(var(--card));
  color: hsl(var(--foreground));
  border-color: hsl(var(--border));
}

.dark input:focus, .dark textarea:focus, .dark select:focus {
  border-color: #F5A623;
  box-shadow: 0 0 0 3px rgba(245, 166, 35, 0.2);
}

.dark .option-btn:hover {
  background-color: rgba(245, 166, 35, 0.15);
  border-color: #F5A623;
}

.dark .option-btn.selected {
  background-color: rgba(245, 166, 35, 0.15);
  border-color: #F5A623;
}
