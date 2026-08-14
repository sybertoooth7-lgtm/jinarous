// frontend/src/components/SecurityHoneypot.tsx
// Invisible honeypot field. Bots and headless automation often fill every
// input they find. Humans never see this. If the field is filled,
// reject the submission server-side.
//
// Usage: place this inside any <form>. Server must check for the field.

import { useEffect, useRef } from 'react';

const HONEYPOT_FIELD_NAME = 'website_url'; // common bot-attractor name

export function SecurityHoneypot() {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Slightly randomize position to evade simple "display:none" detection
    if (inputRef.current) {
      inputRef.current.style.top = `${-9999 - Math.floor(Math.random() * 100)}px`;
      inputRef.current.style.left = `${-9999 - Math.floor(Math.random() * 100)}px`;
    }
  }, []);

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        opacity: 0,
        pointerEvents: 'none',
        height: 0,
        width: 0,
        overflow: 'hidden',
      }}
    >
      <label htmlFor={HONEYPOT_FIELD_NAME}>Leave this field empty</label>
      <input
        ref={inputRef}
        type="text"
        id={HONEYPOT_FIELD_NAME}
        name={HONEYPOT_FIELD_NAME}
        tabIndex={-1}
        autoComplete="off"
        defaultValue=""
      />
    </div>
  );
}

export { HONEYPOT_FIELD_NAME };
