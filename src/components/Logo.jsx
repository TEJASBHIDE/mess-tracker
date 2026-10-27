import logoImg from '../assets/logo.png'

export default function Logo({ className = 'w-10 h-10', alt = 'Mess Tracker Logo' }) {
  return (
    <img
      src={logoImg}
      alt={alt}
      className={`${className} object-contain shrink-0 select-none`}
    />
  )
}
