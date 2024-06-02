import { useId } from 'react'
import SelectComponent, {
  components,
  DropdownIndicatorProps,
  MultiValueRemoveProps,
  ClearIndicatorProps,
} from 'react-select'
import { ChevronDown, X } from 'lucide-react'
import { clsx } from 'clsx'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faFolderOpen } from '@fortawesome/free-regular-svg-icons'

const DropdownIndicator = (props: DropdownIndicatorProps) => {
  return (
    <components.DropdownIndicator {...props}>
      <ChevronDown size={18} strokeWidth={1.4} />
    </components.DropdownIndicator>
  )
}

const ClearIndicator = (props: ClearIndicatorProps) => {
  return (
    <components.ClearIndicator {...props}>
      <X size={18} strokeWidth={1.4} />
    </components.ClearIndicator>
  )
}

const MultiValueRemove = (props: MultiValueRemoveProps) => {
  return (
    <components.MultiValueRemove {...props}>
      <X size={12} strokeWidth={3} />
    </components.MultiValueRemove>
  )
}

const formatGroupLabel = (data: {label: string, options: []}) => {
  return (
    <div className="flex flex-row">
      <div className="text-gray-500">
        <FontAwesomeIcon icon={faFolderOpen} className="h-[12px] mr-1" />
        <span>{data.label}</span>
      </div>
      <div className="ml-auto"><span
        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">{data.options.length}</span>
      </div>
    </div>
  )
}

const formatOptionLabel = ({ value, label, description }: any) => {
  return (
    <div>
      <div>{label}</div>
      <div className="text-gray-500">
        {description}
      </div>
    </div>
  )
}

const selectStyles = {
  control: {
    base: 'flex border rounded-md bg-input hover:cursor-pointer min-w-[100px] !min-h-[36px] w-[100%] h-[100%] text-foreground text-foreground',
    focus: '',
    nonFocus: 'border-border'
  },
  option: {
    base: 'hover:cursor-pointer px-3 py-2 rounded flex gap-2 items-center hover:bg-muted !text-sm',
    focus: 'bg-[rgba(var(--primary),0.1)]',
    selected: 'bg-[rgba(var(--primary),0.3)] hover:bg-[rgba(var(--primary),0.3)] text-primary font-bold'
  }
}

const classNames = {
  control: ({ isFocused }: any) =>
    clsx(
      isFocused ? selectStyles.control.focus : selectStyles.control.nonFocus,
      selectStyles.control.base
    ),
  option: ({ isSelected, isFocused }: any) =>
    clsx(
      selectStyles.option.base,
      isSelected ? selectStyles.option.selected : '',
      isFocused ? selectStyles.option.focus : ''
    ),
  menu: () => 'p-1 mt-1 bg-white rounded-md shadow-md',
  placeholder: () => 'text-placeholder pl-1',
  input: () => 'text-foreground pl-1',
  valueContainer: () => 'p-1 gap-1',
  singleValue: () => 'pl-1',
  multiValue: () => 'flex bg-[rgba(var(--primary),0.15)] p-0 pl-2 rounded-sm text-xs overflow-hidden',
  multiValueLabel: () => 'py-1',
  multiValueRemove: () => 'bg-[rgba(var(--primary),0.1)] hover:bg-[rgba(var(--primary),0.2)] text-primary px-1 ml-2',
  indicatorsContainer: () => 'p-1 gap-1',
  clearIndicator: () => 'text-muted-foreground px-1 hover:text-error',
  indicatorSeparator: () => 'bg-border',
  dropdownIndicator: () => 'p-1 hover:bg-muted text-muted-foreground rounded-md hover:text-foreground',
  groupHeading: () => 'ml-3 mt-2 mb-1 text-muted-foreground text-sm',
  noOptionsMessage: () => 'text-placeholder py-3'
}

type Option = { [string: string]: any }

type SelectProps = {
  options: Array<Option>
  className?: string
  clearValue?: () => void
  isMulti?: boolean
  value?: any
  onChange?: (d: any) => void
  useFormatOptionLabel?: boolean
}

export const Select = ({
                         options,
                         className,
                         isMulti = false,
                         value,
                         onChange,
                         useFormatOptionLabel = false
                       }: SelectProps) => {
  return (
    <SelectComponent
      instanceId={useId()}
      unstyled
      options={options}
      isMulti={isMulti}
      value={value}
      onChange={onChange}
      classNames={{ ...classNames }}
      className={clsx(className)}
      formatGroupLabel={formatGroupLabel}
      formatOptionLabel={useFormatOptionLabel ? formatOptionLabel : undefined}
      components={{ Input: (props) => (
          <components.Input {...props} aria-activedescendant={undefined} />
        ), }}
    />
  )
}
