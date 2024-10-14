export const getColorClassForMaterialized = (type: string): string => {
  switch (type) {
    case 'table':
      return 'bg-purple-200'
    case 'view':
      return 'bg-pink-200'
    case 'incremental':
      return 'bg-blue-200'
    case 'snapshot':
      return 'bg-sky-200'
    case 'seed':
      return 'bg-fuchsia-200'
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