import sys

def replace_in_file(filepath, replacements):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    for old, new in replacements:
        content = content.replace(old, new)
        
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

replace_in_file('src/components/NegotiationFeed.tsx', [
    ('(data: any) =>', '(data: Record<string, string | number>) =>')
])

replace_in_file('src/components/PowerBIPanel.tsx', [
    ('const { loading, error, token, embedUrl } = usePowerBI();', 'const { error, token, embedUrl } = usePowerBI();')
])

replace_in_file('src/lib/mockApi.ts', [
    ('(endpoint: string, options?: any)', '(endpoint: string, options?: RequestInit)'),
    ('(endpoint: string, data?: any)', '(endpoint: string, data?: Record<string, unknown>)')
])

replace_in_file('src/lib/wsClient.ts', [
    ('onRoundUpdate(callback: any)', 'onRoundUpdate(callback: (data: Record<string, unknown>) => void)'),
    ('onComplete(callback: any)', 'onComplete(callback: (data: Record<string, unknown>) => void)'),
    ('onDeferral(callback: any)', 'onDeferral(callback: (data: Record<string, unknown>) => void)'),
    ('round: Number(data.round || 0)', 'round: Number((data as Record<string, unknown>).round || 0)')
])

replace_in_file('src/pages/LandingPage.tsx', [
    ('const pricingRef = useRef<any>(null);', 'const pricingRef = useRef<HTMLDivElement>(null);'),
    ('const targetRef = useRef<any>(null);', 'const targetRef = useRef<HTMLDivElement>(null);'),
    ('const metricsRef = useRef<any>(null);', 'const metricsRef = useRef<HTMLDivElement>(null);')
])

replace_in_file('src/pages/LoginPage.tsx', [
    ('const { from } = (location.state as any) || { from: { pathname: "/" } };', 'const { from } = (location.state as { from: { pathname: string } }) || { from: { pathname: "/" } };'),
    ('catch (err: any)', 'catch (err: unknown)'),
    ('setError(err.message || "Failed to log in.");', 'setError((err as Error).message || "Failed to log in.");'),
    ('setError(err.message || "Sign up failed.");', 'setError((err as Error).message || "Sign up failed.");')
])

replace_in_file('src/pages/OraclePage.tsx', [
    ('const type = (model as any).synthetic ?', 'const type = (model as { synthetic?: boolean }).synthetic ?')
])

replace_in_file('src/lib/auth.ts', [
    ('catch (err: any)', 'catch (err: unknown)'),
    ('setError(err.response?.data?.error || err.message', 'setError((err as { response?: { data?: { error?: string } }, message?: string }).response?.data?.error || (err as Error).message'),
    ('setError(err.response?.data?.error || err.message || "Registration failed");', 'setError((err as { response?: { data?: { error?: string } }, message?: string }).response?.data?.error || (err as Error).message || "Registration failed");')
])

print("Replacements applied.")
