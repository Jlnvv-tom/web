import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 font-mono text-[44px] font-black text-white/10">404</div>
      <h1 className="text-[16px] font-bold text-slate-200">这个知识点还没有场景</h1>
      <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
        可能链接输错了，或者该场景仍在制作中。先回首页看看已上线的场景。
      </p>
      <Link href="/" className="btn btn-primary mt-6 !px-4 !py-2">
        返回首页
      </Link>
    </main>
  );
}
