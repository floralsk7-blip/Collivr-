import logoIcon from '../assets/logo-icon.png'
import logoIconLight from '../assets/logo-icon-light.png'

export default function Logo({ dark = false, size = 'md' }) {
  const isLg = size === 'lg'
  return (
    <div className="flex items-center gap-2">
      <img src={dark ? logoIconLight : logoIcon} alt="" className={isLg ? 'h-[30px] w-[30px]' : 'h-[22px] w-[22px]'} />
      <span
        className={`font-bold tracking-[1px] ${isLg ? 'text-2xl' : 'text-[17px]'}`}
        style={{ color: dark ? '#FFFFFF' : '#1B4332' }}
      >
        COLLIVRA
      </span>
    </div>
  )
}
