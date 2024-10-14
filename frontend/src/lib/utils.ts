export const getColorClassForMaterialized = (type: string): string => {
  switch (type) {
    case 'table':
      return 'bg-[#E6E6FA]'
    case 'view':
      return 'bg-[#F0E6FF]'
    case 'incremental':
      return 'bg-[#ADD8E6]'
    case 'snapshot':
      return 'bg-indigo-200'
    case 'seed':
      return 'bg-violet-200'
    default:
      return 'bg-gray-200'
  }
}

export const materializedTypes = [
  'table',
  'view',
  'incremental',
  'snapshot',
  'seed',
  // Add any other types here
]