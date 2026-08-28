import { ImageResponse } from 'next/og'
 
export const runtime = 'edge'
 
export const size = {
  width: 32,
  height: 32,
}
 
export const contentType = 'image/png'
 
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#10b981',
          borderRadius: '50%',
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Pelota de tenis */}
          <circle cx="12" cy="12" r="10" fill="#d0f0c0" stroke="#fff" strokeWidth="1.5" />
          
          {/* Curva superior */}
          <path
            d="M 6 8 Q 12 4 18 8"
            stroke="#fff"
            strokeWidth="1.5"
            fill="none"
          />
          
          {/* Curva inferior */}
          <path
            d="M 6 16 Q 12 20 18 16"
            stroke="#fff"
            strokeWidth="1.5"
            fill="none"
          />
        </svg>
      </div>
    ),
    {
      ...size,
    }
  )
}
