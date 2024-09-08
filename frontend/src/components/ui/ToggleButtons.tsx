import React, { useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faColumns, faTable } from '@fortawesome/free-solid-svg-icons'
import { useStore as useStoreZustand } from '@/store/zustand'
import { useReactFlow } from 'reactflow'

const ToggleButtons = () => {
  const { setEdges } = useReactFlow()
  const showColumn = useStoreZustand((state) => state.showColumn)
  const setShowColumn = useStoreZustand((state) => state.setShowColumn)
  const [activeButton, setActiveButton] = useState('column')

  const buttons = [
    { id: 'table', icon: faTable, label: 'Table' },
    { id: 'column', icon: faColumns, label: 'Column' },
  ]

  // showColumnが変更されたときにactiveButtonを変更する
  useEffect(() => {
    setActiveButton(showColumn ? 'column' : 'table')
  }, [showColumn])

  // ボタンが押されたときの処理
  function handleToggleButton(buttonId: string) {
    setShowColumn(buttonId === 'column')
    // FIXME warningが起きるのでエッジを消しているが・・・
    setEdges([])
  }

  return (
    <div className="inline-flex rounded-md shadow-sm" role="group">
      {buttons.map((button) => (
        <button
          key={button.id}
          type="button"
          className={`px-4 py-2 text-sm font-medium border ${
            activeButton === button.id
              ? 'bg-blue-500 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
          } ${
            button.id === buttons[0].id
              ? 'rounded-l-lg'
              : button.id === buttons[buttons.length - 1].id
                ? 'rounded-r-lg'
                : ''
          }`}
          onClick={() => handleToggleButton(button.id)}
        >
          <FontAwesomeIcon icon={button.icon} className="mr-2" />
          {button.label}
        </button>
      ))}
    </div>
  );
};

export default ToggleButtons