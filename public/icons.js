// Staff panel icons: one line-icon set (24×24, 1.8 px stroke, rounded, currentColor), each
// drawn for the meaning of its page. Used by the side menu and the overview cards.
const P={
 overview:'<rect x="3.5" y="3.5" width="7" height="8" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="5" rx="1.5"/><rect x="13.5" y="11.5" width="7" height="9" rx="1.5"/><rect x="3.5" y="14.5" width="7" height="6" rx="1.5"/>',
 users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M15.5 4.8a3.3 3.3 0 0 1 0 6.4M18 14.8c1.9.8 3.1 2.6 3.5 5.2"/>',
 report:'<path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-10z"/><path d="M14 3.5v5h5"/><path d="M9 17v-3M12 17v-5M15 17v-2"/>',
 flag:'<path d="M5 21V4"/><path d="M5 4.5c4-2 6.5 2 10.5 0 1.2-.6 2.5-.8 3.5-.5v9.5c-1-.3-2.3-.1-3.5.5-4 2-6.5-2-10.5 0"/>',
 history:'<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3.5 4v4h4"/><path d="M12 7.5V12l3 2"/>',
 revenue:'<path d="M3.5 20.5h17"/><path d="M5 16l4.5-5 3.5 3 6-7"/><path d="M15 7h4v4"/>',
 percent:'<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
 wallet:'<path d="M19 7.5V6a2 2 0 0 0-2-2H5.5A2.5 2.5 0 0 0 3 6.5v11A2.5 2.5 0 0 0 5.5 20H19a2 2 0 0 0 2-2v-8.5a2 2 0 0 0-2-2H5.5A2.5 2.5 0 0 1 3 5"/><circle cx="16.5" cy="13.75" r="1.25"/>',
 crypto:'<circle cx="12" cy="12" r="8.5"/><path d="M8.5 8.5h7M12 8.5v8M9 12.2c1 .5 2 .8 3 .8s2-.3 3-.8"/>',
 table:'<rect x="2.5" y="6.5" width="19" height="11" rx="5.5"/><rect x="6" y="9.5" width="12" height="5" rx="2.5"/>',
 eye:'<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
 cards:'<rect x="8" y="4" width="11" height="15" rx="2" transform="rotate(8 13.5 11.5)"/><rect x="4" y="5" width="11" height="15" rx="2"/><path d="M9.5 10.5l-1.8 2.3 1.8 2.2 1.8-2.2z"/>',
 shield:'<path d="M12 3l7.5 3v5.5c0 4.5-3.2 8.2-7.5 9.5-4.3-1.3-7.5-5-7.5-9.5V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
 database:'<ellipse cx="12" cy="5.5" rx="7.5" ry="2.5"/><path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13"/><path d="M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5"/>',
 activity:'<path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12"/><circle cx="4.5" cy="6.5" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="17.5" r="1"/>',
 settings:'<path d="M4 7h10M18 7h2M4 17h2M10 17h10M4 12h4M12 12h8"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/><circle cx="10" cy="12" r="2"/>',
 account:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3.2"/><path d="M6.3 18.3c1.2-2.2 3.2-3.3 5.7-3.3s4.5 1.1 5.7 3.3"/>',
 transfer:'<path d="M4 8.5h15M15.5 5l3.5 3.5-3.5 3.5"/><path d="M20 15.5H5M8.5 12L5 15.5 8.5 19"/>',
 infinity:'<path d="M12 12c-1.6-2.2-3.2-3.5-5-3.5a3.5 3.5 0 0 0 0 7c1.8 0 3.4-1.3 5-3.5zm0 0c1.6 2.2 3.2 3.5 5 3.5a3.5 3.5 0 0 0 0-7c-1.8 0-3.4 1.3-5 3.5z"/>',
 spade:'<path d="M12 3.5c3 3.5 7 6.2 7 9.5a3.6 3.6 0 0 1-6.2 2.5L13.5 20h-3l.7-4.5A3.6 3.6 0 0 1 5 13c0-3.3 4-6 7-9.5z"/>',
};
export const icon=name=>P[name]?'<svg class="uiIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+P[name]+'</svg>':'';
// Which icon each side-menu page shows.
export const NAV_ICONS={overview:'overview',accounts:'users',reports:'report',moderation:'flag',history:'history',revenue:'revenue',rake:'percent',crypto:'wallet',tables:'table',inspect:'eye',hands:'cards',security:'shield',database:'database',activity:'activity',settings:'settings',profile:'account'};
export function paintNavIcons(root=document){for(const b of root.querySelectorAll('.navItem[data-panel]')){const s=b.querySelector('span:first-child'),n=NAV_ICONS[b.dataset.panel];if(s&&n&&!s.querySelector('svg')){s.innerHTML=icon(n);s.classList.add('navIcon');}}}
