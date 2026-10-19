import { useRef } from 'react';
import { Popover } from './Popover';
import { COVER_COLORS } from '../theme';

const EMOJIS = (
  '🌷 🌸 🌼 🌻 🌿 🍀 🌱 🌙 ⭐ ✨ ☁️ 🌈 ☀️ ❄️ 🔥 💧 ' +
  '📒 📓 📔 📕 📗 📘 📙 📝 ✏️ 🖍️ 📌 📎 🗂️ 📁 📅 🗓️ ' +
  '✅ ☑️ 💡 🎯 🧭 🔖 🏷️ 💬 💭 📣 🔔 ⏰ ⌛ 📊 📈 🧾 ' +
  '🏠 🏫 🏢 ✈️ 🚗 🗺️ 🎒 💼 💻 📱 🎧 📷 🎮 🎨 🎵 🎬 ' +
  '🍓 🍑 🍋 🍇 🍒 🥝 🍰 🧁 🍪 ☕ 🍵 🧋 🍙 🍜 🍱 🥗 ' +
  '🐰 🐱 🐶 🐻 🐼 🐥 🐧 🦊 🐹 🐨 🦄 🐳 🦋 🐝 🐢 🐾 ' +
  '💜 💚 🧡 💙 💗 💛 🤍 🩷 🩵 💖 💝 🎀 🎁 🎉 🪄 🧸 ' +
  '💪 🏃 🧘 🛌 🧹 🛒 💰 💳 📚 🧪 🧠 🩺 💊 🌍 🔒 🔑'
).split(' ');

type Anchored = { anchor: HTMLElement; onClose: () => void };

export function EmojiPicker({ anchor, onClose, onPick }: Anchored & { onPick: (emoji: string) => void }) {
  return (
    <Popover anchor={anchor} onClose={onClose}>
      <div className="pop-head">
        <span>아이콘 고르기</span>
        <button className="btn ghost" style={{ padding: '3px 8px' }} onClick={() => onPick('')}>지우기</button>
      </div>
      <div className="emoji-grid">
        {EMOJIS.map((e, i) => (
          <button key={i} onClick={() => onPick(e)}>{e}</button>
        ))}
      </div>
    </Popover>
  );
}

export function CoverPicker({
  anchor, onClose, value, onPick, onUpload,
}: Anchored & { value: string; onPick: (cover: string) => void; onUpload: (file: File) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <Popover anchor={anchor} onClose={onClose} align="right">
      <div style={{ width: 280 }}>
        <div className="pop-head">
          <span>커버 색</span>
          <button className="btn ghost" style={{ padding: '3px 8px' }} onClick={() => onPick('')}>커버 없애기</button>
        </div>
        <div className="swatches">
          {COVER_COLORS.map((c) => (
            <button
              key={c}
              className={`swatch ${value === c ? 'selected' : ''}`}
              style={{ background: c }}
              aria-label={c}
              onClick={() => onPick(c)}
            />
          ))}
        </div>
        <button className="btn" style={{ width: '100%', marginTop: 12, justifyContent: 'center' }} onClick={() => fileRef.current?.click()}>
          🖼️ 이미지 올리기
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = '';
          }}
        />
      </div>
    </Popover>
  );
}

export const randomCover = () => COVER_COLORS[Math.floor(Math.random() * 6)];
export const randomEmoji = () => EMOJIS[Math.floor(Math.random() * 32)];
