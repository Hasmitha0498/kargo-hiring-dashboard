// One date format everywhere, fixed to the company's time zone, so server and browser render identical text
// (and a UTC server doesn't show Mumbai times 5.5 hours off).
const TZ = 'Asia/Kolkata';
const dateTime = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const dateOnly = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });

export const formatDateTime = (iso: string | null | undefined) => (iso ? `${dateTime.format(new Date(iso))} IST` : '—');
export const formatDate = (iso: string | null | undefined) => (iso ? dateOnly.format(new Date(iso)) : '—');
