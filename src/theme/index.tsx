import React, { useMemo } from 'react'
import { Text, TextProps as TextPropsOriginal } from 'rebass'
import styled, {
  createGlobalStyle,
  css,
  DefaultTheme,
  ThemeProvider as StyledComponentsThemeProvider,
} from 'styled-components/macro'

import { useIsDarkMode } from '../state/user/hooks'
import { Colors } from './styled'

export * from './components'

type TextProps = Omit<TextPropsOriginal, 'css'>

export const MEDIA_WIDTHS = {
  upToExtraSmall: 500,
  upToSmall: 720,
  upToMedium: 960,
  upToLarge: 1280,
}

// Migrating to a standard z-index system https://getbootstrap.com/docs/5.0/layout/z-index/
// Please avoid using deprecated numbers
export enum Z_INDEX {
  deprecated_zero = 0,
  deprecated_content = 1,
  dropdown = 1000,
  sticky = 1020,
  fixed = 1030,
  modalBackdrop = 1040,
  offcanvas = 1050,
  modal = 1060,
  popover = 1070,
  tooltip = 1080,
}

const mediaWidthTemplates: { [width in keyof typeof MEDIA_WIDTHS]: typeof css } = Object.keys(MEDIA_WIDTHS).reduce(
  (accumulator, size) => {
    ;(accumulator as any)[size] = (a: any, b: any, c: any) => css`
      @media (max-width: ${(MEDIA_WIDTHS as any)[size]}px) {
        ${css(a, b, c)}
      }
    `
    return accumulator
  },
  {}
) as any

const white = '#FBFDFF'
const black = '#231f20'

function colors(darkMode: boolean): Colors {
  return {
    darkMode,
    // base
    white,
    black,

    // text hsl(h, s%, l%)
    text1: darkMode ? '#FFFFFF' : '#000000',
    text2: darkMode ? '#C3C5CB' : '#565A69',
    text3: darkMode ? '#6C7284' : '#888D9B',
    text4: darkMode ? '#565A69' : '#C3C5CB',
    text5: darkMode ? '#2C2F36' : '#EDEEF2',

    // backgrounds / greys
    bg0: darkMode ? '#191B1F' : 'hsl(5, 8%, 97%)',
    bg1: darkMode ? '#1F2128' : 'hsl(5, 100%, 100%)',
    bg2: darkMode ? '#2C2F36' : 'hsl(5, 18%, 100%)',
    bg3: darkMode ? '#40444F' : 'hsl(5, 10%, 92%)',
    bg4: darkMode ? '#565A69' : 'hsl(5, 7%, 87%)',
    bg5: darkMode ? '#6C7284' : 'hsl(5, 3%, 77%)',
    bg6: darkMode ? '#6C7284' : 'hsl(215, 100%, 98%)',

    //specialty colors
    modalBG: darkMode ? 'rgba(0,0,0,.425)' : 'rgba(0,0,0,0.3)',
    advancedBG: darkMode ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.6)',

    //primary colors
    primary1: darkMode ? 'hsl(215, 79%, 51%)' : 'hsl(110, 63%, 42%)',
    primary2: darkMode ? 'hsl(215, 79%, 56%)' : 'hsl(110, 90%, 77%)',
    primary3: darkMode ? 'hsl(215, 79%, 61%)' : 'hsl(110, 90%, 80%)',
    primary4: darkMode ? 'hsla(215, 79%, 61%, 70%)' : 'hsl(110, 58%, 92%)',
    primary5: darkMode ? 'hsla(215, 68%, 26%, 70%)' : 'hsl(110, 83%, 95%)',

    // color text
    primaryText1: darkMode ? 'hsl(215, 100%, 71%)' : 'hsl(110, 63%, 42%)',

    // secondary colors
    secondary1: darkMode ? 'hsl(215, 79%, 51%)' : 'hsl(5, 83%, 72%)',
    secondary2: darkMode ? 'hsla(331, 100%, 5%, 26%)' : 'hsl(110, 58%, 92%)',
    secondary3: darkMode ? 'hsla(331, 100%, 5%, 26%)' : 'hsl(110, 83%, 95%)',

    // other
    red1: 'hsl(5, 83%, 62%)',
    red2: 'hsl(356, 94%, 57%)',
    red3: 'hsl(5, 83%, 72%)',
    green1: 'hsl(110, 63%, 42%)',
    yellow1: 'hsl(48, 100%, 72%)',
    yellow2: 'hsl(29, 90%, 54%)',
    yellow3: 'hsl(215, 100%, 80%)',
    blue1: 'hsl(215, 79%, 51%)',
    blue2: 'hsl(215, 100%, 66%)',

    error: darkMode ? '#FD4040' : '#DF1F38',
    success: darkMode ? '#27AE60' : '#007D35',
    warning: '#FF8F00',

    // dont wanna forget these blue yet
    blue4: darkMode ? '#153d6f70' : '#C4D9F8',
    // blue5: darkMode ? '#153d6f70' : '#EBF4FF',
  }
}

function theme(darkMode: boolean): DefaultTheme {
  return {
    ...colors(darkMode),

    grids: {
      sm: 8,
      md: 12,
      lg: 24,
    },

    //shadows
    shadow1: darkMode ? '#000' : '#2F80ED',

    // media queries
    mediaWidth: mediaWidthTemplates,

    // css snippets
    flexColumnNoWrap: css`
      display: flex;
      flex-flow: column nowrap;
    `,
    flexRowNoWrap: css`
      display: flex;
      flex-flow: row nowrap;
    `,
  }
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const darkMode = useIsDarkMode()

  const themeObject = useMemo(() => theme(darkMode), [darkMode])

  return <StyledComponentsThemeProvider theme={themeObject}>{children}</StyledComponentsThemeProvider>
}

const TextWrapper = styled(Text)<{ color: keyof Colors }>`
  color: ${({ color, theme }) => (theme as any)[color]};
`

export const TYPE = {
  main(props: TextProps) {
    return <TextWrapper fontWeight={500} color={'text2'} {...props} />
  },
  link(props: TextProps) {
    return <TextWrapper fontWeight={500} color={'primary1'} {...props} />
  },
  label(props: TextProps) {
    return <TextWrapper fontWeight={600} color={'text1'} {...props} />
  },
  black(props: TextProps) {
    return <TextWrapper fontWeight={500} color={'text1'} {...props} />
  },
  white(props: TextProps) {
    return <TextWrapper fontWeight={500} color={'white'} {...props} />
  },
  body(props: TextProps) {
    return <TextWrapper fontWeight={400} fontSize={16} color={'text1'} {...props} />
  },
  largeHeader(props: TextProps) {
    return <TextWrapper fontWeight={600} fontSize={24} {...props} />
  },
  mediumHeader(props: TextProps) {
    return <TextWrapper fontWeight={500} fontSize={20} {...props} />
  },
  subHeader(props: TextProps) {
    return <TextWrapper fontWeight={400} fontSize={14} {...props} />
  },
  small(props: TextProps) {
    return <TextWrapper fontWeight={500} fontSize={11} {...props} />
  },
  blue(props: TextProps) {
    return <TextWrapper fontWeight={900} color={'blue1'} {...props} />
  },
  yellow(props: TextProps) {
    return <TextWrapper fontWeight={500} color={'yellow3'} {...props} />
  },
  red(props: TextProps) {
    return <TextWrapper fontWeight={900} color={'red1'} {...props} />
  },
  green(props: TextProps) {
    return <TextWrapper fontWeight={900} color={'green1'} {...props} />
  },
  darkGray(props: TextProps) {
    return <TextWrapper fontWeight={500} color={'text3'} {...props} />
  },
  gray(props: TextProps) {
    return <TextWrapper fontWeight={500} color={'bg3'} {...props} />
  },
  italic(props: TextProps) {
    return <TextWrapper fontWeight={500} fontSize={12} fontStyle={'italic'} color={'text2'} {...props} />
  },
  error({ error, ...props }: { error: boolean } & TextProps) {
    return <TextWrapper fontWeight={500} color={error ? 'red1' : 'text2'} {...props} />
  },
}

export const ThemedGlobalStyle = createGlobalStyle`
html {
  color: ${({ theme }) => theme.text1};
  background-color: ${({ theme }) => theme.bg1} !important;
}

a {
 color: ${({ theme }) => theme.blue1}; 
}
`
