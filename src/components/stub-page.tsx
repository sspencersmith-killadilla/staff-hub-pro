export function makeStub(title: string) {
  return function StubPage() {
    return (
      <div className="p-8">
        <h1 className="text-4xl font-black tracking-tight text-slate-900 uppercase mb-2">{title}</h1>
        <div className="h-px bg-slate-200 mb-6" />
        <div className="bg-white rounded-lg border border-slate-200 p-10 text-center text-sm text-slate-400">
          Coming in a later phase.
        </div>
      </div>
    );
  };
}
