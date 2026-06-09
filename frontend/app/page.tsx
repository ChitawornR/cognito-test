import Link from "next/link";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-20">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900">
          ยืนยันตัวตนธุรกิจของคุณ
        </h1>
        <p className="mt-4 text-lg text-gray-600">
          ระบบตรวจสอบเอกสารธุรกิจ — สะดวก รวดเร็ว ปลอดภัย
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            href="/register"
            className="rounded-md bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            เริ่มต้นใช้งาน
          </Link>
          <Link
            href="/login"
            className="rounded-md border border-gray-300 px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            เข้าสู่ระบบ
          </Link>
        </div>
      </div>

      <div className="mt-20 grid grid-cols-1 gap-8 sm:grid-cols-3">
        {[
          {
            icon: "🔒",
            title: "ปลอดภัย",
            desc: "เข้ารหัสด้วย AWS Cognito + Email OTP ทุกครั้งที่ login",
          },
          {
            icon: "⚡",
            title: "รวดเร็ว",
            desc: "ส่งเอกสารได้ในไม่กี่นาที ระบบจัดเก็บอัตโนมัติ",
          },
          {
            icon: "📊",
            title: "ติดตามสถานะ",
            desc: "ตรวจสอบสถานะเอกสารได้ตลอดเวลาผ่าน dashboard",
          },
        ].map((f) => (
          <div
            key={f.title}
            className="rounded-lg border border-gray-200 bg-white p-6"
          >
            <div className="text-3xl">{f.icon}</div>
            <h3 className="mt-3 text-lg font-semibold text-gray-900">
              {f.title}
            </h3>
            <p className="mt-2 text-sm text-gray-600">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
