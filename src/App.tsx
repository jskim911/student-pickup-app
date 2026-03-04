import { useState, useEffect } from "react";
import { Plus, Phone, MessageSquare, Save, ChevronRight, Users, UserPlus, X, Search, Home } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp,
  FieldValue
} from "firebase/firestore";
import { db } from "./lib/firebase";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// TYPES
interface Pickup {
  id: string;
  date: string;
  time: string;
  studentName: string;
  departure: string;
  arrival: string;
  notes: string;
  phoneNumber: string;
  status: "pending" | "completed";
  createdAt?: FieldValue;
  updatedAt?: FieldValue;
}

interface Student {
  id: string;
  name: string;
  phoneNumber: string;
  defaultDeparture: string;
  defaultArrival: string;
  notes: string;
  smsMessage: string;
}

interface User {
  id: string;
  username: string;
  password?: string;
  role: "admin" | "user";
  approved: boolean;
  createdAt?: FieldValue;
}

export default function App() {
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [isAdminViewOpen, setIsAdminViewOpen] = useState(false);
  const [editingPickup, setEditingPickup] = useState<Pickup | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"pending" | "completed">("pending");
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("정보가 정상적으로 저장되었습니다.");

  // AUTH FORM STATE
  const [authForm, setAuthForm] = useState({ username: "", password: "" });
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    time: "15:00",
    studentName: "",
    departure: "2호점",
    arrival: "2호점",
    notes: "",
    phoneNumber: "",
    status: "pending" as "pending" | "completed"
  });

  const [studentFormData, setStudentFormData] = useState({
    name: "",
    phoneNumber: "",
    defaultDeparture: "2호점",
    defaultArrival: "2호점",
    notes: "",
    smsMessage: ""
  });

  // PHONE FORMATTER
  const formatPhoneNumber = (value: string) => {
    const numbers = value.replace(/[^\d]/g, "");
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>, isStudent = false) => {
    const formatted = formatPhoneNumber(e.target.value);
    if (isStudent) {
      setStudentFormData({ ...studentFormData, phoneNumber: formatted });
    } else {
      setFormData({ ...formData, phoneNumber: formatted });
    }
  };

  // FETCH DATA
  useEffect(() => {
    try {
      const qPickups = query(collection(db, "pickups"), orderBy("date", "desc"), orderBy("time", "asc"));
      const unsubPickups = onSnapshot(qPickups, (snapshot) => {
        setPickups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Pickup[]);
      });

      const qStudents = query(collection(db, "students"), orderBy("name", "asc"));
      const unsubStudents = onSnapshot(qStudents, (snapshot) => {
        setStudents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Student[]);
      });

      const qUsers = query(collection(db, "users"), orderBy("createdAt", "desc"));
      const unsubUsers = onSnapshot(qUsers, async (snapshot) => {
        const fetchedUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as User[];
        setUsers(fetchedUsers);

        // INITIALIZE ADMIN IF NOT EXISTS
        if (!fetchedUsers.some(u => u.username === "jskim119")) {
          await addDoc(collection(db, "users"), {
            username: "jskim119",
            password: "6748!!",
            role: "admin",
            approved: true,
            createdAt: serverTimestamp()
          });
        }
      });

      return () => { unsubPickups(); unsubStudents(); unsubUsers(); };
    } catch {
      console.warn("Firebase not configured correctly.");
    }
  }, []);

  // AUTH LOGIC
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const username = authForm.username.trim();
    const password = authForm.password.trim();

    // HARDCODED ADMIN CHECK (Fallback for initial setup)
    if (username === "jskim119" && password === "6748!!") {
      const adminUser: User = { id: "admin-fixed", username: "jskim119", role: "admin", approved: true };
      setCurrentUser(adminUser);
      setToastMessage("관리자 계정으로 접속되었습니다.");
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
      return;
    }

    if (authMode === "login") {
      const user = users.find(u => u.username === username && u.password === password);
      if (user) {
        if (!user.approved && user.role !== "admin") {
          alert("관리자의 승인이 대기 중입니다.");
          return;
        }
        setCurrentUser(user);
        setToastMessage(`${user.username}님, 환영합니다!`);
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
      } else {
        alert("아이디 또는 비밀번호가 일치하지 않습니다.");
      }
    } else {
      if (users.some(u => u.username === username)) {
        alert("이미 존재하는 아이디입니다.");
        return;
      }
      try {
        await addDoc(collection(db, "users"), {
          username,
          password,
          role: "user",
          approved: false,
          createdAt: serverTimestamp()
        });
        alert("회원가입 요청이 완료되었습니다. 관리자 승인 후 이용 가능합니다.");
        setAuthMode("login");
      } catch (error) {
        console.error("Signup error:", error);
      }
    }
  };

  const handleApproveUser = async (userId: string) => {
    try {
      await updateDoc(doc(db, "users", userId), { approved: true });
    } catch (error) {
      console.error("Approval error:", error);
    }
  };

  // AUTO-FILL LOGIC
  const handleStudentSelect = (student: Student) => {
    setFormData({
      ...formData,
      studentName: student.name,
      phoneNumber: student.phoneNumber,
      departure: student.defaultDeparture,
      arrival: student.defaultArrival,
      notes: student.notes || ""
    });
  };

  const handleOpenModal = (pickup?: Pickup) => {
    if (pickup) {
      setEditingPickup(pickup);
      setFormData({
        date: pickup.date || new Date().toISOString().split('T')[0],
        time: pickup.time,
        studentName: pickup.studentName,
        departure: pickup.departure,
        arrival: pickup.arrival,
        notes: pickup.notes,
        phoneNumber: pickup.phoneNumber,
        status: pickup.status || "pending"
      });
    } else {
      setEditingPickup(null);
      setFormData({
        date: new Date().toISOString().split('T')[0],
        time: "15:00",
        studentName: "",
        departure: "2호점",
        arrival: "2호점",
        notes: "",
        phoneNumber: "",
        status: "pending"
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent, isCompleteAction = false) => {
    e.preventDefault();
    try {
      const finalData = {
        ...formData,
        status: isCompleteAction ? "completed" : formData.status,
        updatedAt: serverTimestamp()
      };

      if (editingPickup) {
        await updateDoc(doc(db, "pickups", editingPickup.id), finalData);
      } else {
        await addDoc(collection(db, "pickups"), { ...finalData, createdAt: serverTimestamp() });
      }

      setIsModalOpen(false);

      if (isCompleteAction) {
        setActiveTab("completed");
      }

      // SHOW TOAST
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);

    } catch (error) {
      console.error("Error saving pickup:", error);
      alert("데이터 저장 중 오류가 발생했습니다.");
    }
  };

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, "students"), studentFormData);
      setStudentFormData({ name: "", phoneNumber: "", defaultDeparture: "2호점", defaultArrival: "2호점", notes: "", smsMessage: "" });
      setIsStudentModalOpen(false);
    } catch (error) {
      console.error("Error saving student:", error);
      alert("학생 등록 중 오류가 발생했습니다.");
    }
  };

  const filteredPickups = pickups.filter(p => (p.status || "pending") === activeTab);

  // GROUP BY DATE
  const groupedPickupsByDate = filteredPickups.reduce((groups, pickup) => {
    const date = pickup.date || "미지정";
    if (!groups[date]) groups[date] = [];
    groups[date].push(pickup);
    return groups;
  }, {} as Record<string, Pickup[]>);

  const formatDateHeader = (dateStr: string) => {
    if (dateStr === "미지정") return dateStr;
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(date);
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#1A2E44] flex items-center justify-center p-5 font-pretendard">
        <div className="w-full max-w-md space-y-8 animate-in fade-in zoom-in duration-500">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-black text-white tracking-tighter">이베아 유소년 <span className="text-[#FF6B00]">야구교실</span></h1>
            <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.3em]">EB EA Youth Baseball Academy</p>
          </div>

          <div className="bg-white rounded-[40px] p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 h-32 w-32 bg-slate-50 rounded-full translate-x-1/2 -translate-y-1/2" />

            <div className="relative space-y-6">
              <div className="flex gap-4 p-1 bg-slate-50 rounded-2xl">
                <button onClick={() => setAuthMode("login")} className={cn("flex-1 py-3 rounded-xl text-xs font-black transition-all", authMode === "login" ? "bg-white text-[#1A2E44] shadow-sm" : "text-slate-400")}>로그인</button>
                <button onClick={() => setAuthMode("signup")} className={cn("flex-1 py-3 rounded-xl text-xs font-black transition-all", authMode === "signup" ? "bg-white text-[#1A2E44] shadow-sm" : "text-slate-400")}>회원가입</button>
              </div>

              <form onSubmit={handleAuthSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">아이디</label>
                  <input type="text" required className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 font-black text-slate-800 outline-none text-xs focus:border-[#FF6B00] transition-colors" placeholder="아이디 입력" value={authForm.username} onChange={e => setAuthForm({ ...authForm, username: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">비밀번호</label>
                  <input type="password" required className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 font-black text-slate-800 outline-none text-xs focus:border-[#FF6B00] transition-colors" placeholder="비밀번호 입력" value={authForm.password} onChange={e => setAuthForm({ ...authForm, password: e.target.value })} />
                </div>
                <button type="submit" className="w-full h-14 rounded-2xl bg-[#FF6B00] text-white font-black text-sm shadow-xl shadow-orange-500/20 active:scale-[0.98] transition-all mt-4">
                  {authMode === "login" ? "입장하기" : "가입 요청하기"}
                </button>
              </form>
            </div>
          </div>

          <p className="text-center text-[10px] font-bold text-white/20 uppercase tracking-widest">Powered by Antigravity</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-32 font-pretendard">
      <div className="absolute top-0 left-0 right-0 h-80 bg-gradient-to-b from-[#1A2E44] to-[#F8FAFC]/0 pointer-events-none" />

      <div className="relative mx-auto max-w-2xl px-5 pt-10">
        <header className="mb-10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => { setIsAdminViewOpen(false); setActiveTab("pending"); }}
              className="h-12 w-12 flex items-center justify-center rounded-2xl bg-white shadow-sm text-[#1A2E44] border border-slate-100 hover:bg-slate-50 transition-all active:scale-95"
              title="홈으로 가기"
            >
              <Home size={22} strokeWidth={2.5} />
            </button>
            <div className="space-y-0.5">
              <h1 className="text-3xl font-black text-white tracking-tight">차량 운행 <span className="text-[#FF6B00]">기록</span></h1>
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">WELCOME, {currentUser.username}</p>
            </div>
          </div>
          <div className="flex gap-2.5">
            {currentUser.role === "admin" && (
              <button
                onClick={() => setIsAdminViewOpen(!isAdminViewOpen)}
                className={cn(
                  "flex h-12 px-5 items-center justify-center rounded-2xl font-bold text-xs gap-2 transition-all",
                  isAdminViewOpen ? "bg-[#FF6B00] text-white shadow-lg shadow-orange-500/20" : "bg-white/10 backdrop-blur-md text-white border border-white/20 hover:bg-white/20"
                )}
              >
                <Users size={16} /> {isAdminViewOpen ? "운행 관리" : "회원 승인"}
              </button>
            )}
            {!isAdminViewOpen && (
              <>
                <button
                  onClick={() => setIsStudentModalOpen(true)}
                  className="flex h-12 px-5 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-md text-white border border-white/20 hover:bg-white/20 transition-all font-bold text-xs gap-2"
                >
                  <Users size={16} /> 학생 관리
                </button>
                <button
                  onClick={() => handleOpenModal()}
                  className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FF6B00] text-white shadow-lg shadow-orange-500/20 transition-all active:scale-95"
                >
                  <Plus size={28} strokeWidth={3} />
                </button>
              </>
            )}
            <button onClick={() => setCurrentUser(null)} className="h-12 w-12 flex items-center justify-center rounded-2xl bg-rose-50 text-rose-500 border border-rose-100 hover:bg-rose-100 transition-all active:scale-95" title="로그아웃"><X size={20} /></button>
          </div>
        </header>

        {isAdminViewOpen ? (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-xl font-black text-slate-800 px-2 flex items-center gap-2 mb-6">가입 승인 대기 <span className="text-[#FF6B00] text-sm">({users.filter(u => !u.approved && u.role !== "admin").length})</span></h2>
            <div className="grid gap-3">
              {users.filter(u => !u.approved && u.role !== "admin").map(user => (
                <div key={user.id} className="bg-white p-5 rounded-[28px] border border-slate-100 shadow-sm flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 font-black">{user.username.slice(0, 1)}</div>
                    <div>
                      <h3 className="text-base font-black text-slate-800">{user.username}</h3>
                      <p className="text-[10px] font-bold text-slate-400">가입 요청일: {user.createdAt ? new Date((user.createdAt as any).seconds * 1000).toLocaleDateString() : "-"}</p>
                    </div>
                  </div>
                  <button onClick={() => handleApproveUser(user.id)} className="px-5 py-2.5 rounded-xl bg-[#1A2E44] text-white text-[11px] font-black shadow-lg active:scale-95 transition-all">승인하기</button>
                </div>
              ))}
              {users.filter(u => !u.approved && u.role !== "admin").length === 0 && (
                <div className="py-20 text-center rounded-[40px] border-2 border-dashed border-slate-200 bg-white/40">
                  <p className="text-sm font-bold text-slate-400">승인 대기 중인 회원이 없습니다</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* TAB NAVIGATION */}
            <div className="flex gap-4 mb-6 px-1">
              <button
                onClick={() => setActiveTab("pending")}
                className={cn(
                  "text-sm font-black transition-all pb-2 border-b-2",
                  activeTab === "pending" ? "text-white border-[#FF6B00]" : "text-white/40 border-transparent"
                )}
              >
                예약 리스트
              </button>
              <button
                onClick={() => setActiveTab("completed")}
                className={cn(
                  "text-sm font-black transition-all pb-2 border-b-2",
                  activeTab === "completed" ? "text-white border-[#FF6B00]" : "text-white/40 border-transparent"
                )}
              >
                운행 완료
              </button>
            </div>

            <div className="space-y-8">
              {pickups.length === 0 ? (
                <div className="rounded-[40px] border-2 border-dashed border-slate-200 py-24 text-center bg-white/40">
                  <p className="font-bold text-slate-400 text-sm">등록된 운행 기록이 없습니다</p>
                </div>
              ) : (
                Object.entries(groupedPickupsByDate).map(([date, items]) => (
                  <div key={date} className="space-y-3">
                    <div className="flex items-center gap-3 px-2">
                      <span className="text-[11px] font-black text-[#1A2E44]/50 tracking-tighter uppercase">{formatDateHeader(date)}</span>
                      <div className="h-[1px] flex-1 bg-slate-200" />
                    </div>
                    {items.map((pickup) => (
                      <div
                        key={pickup.id}
                        onClick={() => setExpandedId(expandedId === pickup.id ? null : pickup.id)}
                        className={cn(
                          "bg-white rounded-[28px] border border-slate-100 transition-all cursor-pointer overflow-hidden",
                          expandedId === pickup.id ? "shadow-xl scale-[1.02]" : "shadow-sm hover:shadow-md"
                        )}
                      >
                        <div className="p-5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className={cn(
                                "h-12 w-12 rounded-2xl flex items-center justify-center font-black transition-colors",
                                expandedId === pickup.id ? "bg-[#FF6B00] text-white" : "bg-slate-50 text-[#1A2E44]"
                              )}>
                                {pickup.time.split(":")[0]}
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="text-[10px] font-bold text-slate-400 block">{pickup.time}</span>
                                <h2 className="text-lg font-black text-slate-800 leading-tight truncate">{pickup.studentName}</h2>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="px-3 py-1.5 rounded-full bg-slate-50 text-[10px] font-bold text-slate-500 border border-slate-100">
                                {pickup.departure} → {pickup.arrival}
                              </div>
                              <ChevronRight size={16} className={cn("text-slate-300 transition-transform", expandedId === pickup.id && "rotate-90")} />
                            </div>
                          </div>

                          {expandedId === pickup.id && (
                            <div className="mt-5 pt-5 border-t border-slate-50 space-y-4 animate-in fade-in slide-in-from-top-2">
                              <div className="grid grid-cols-2 gap-2">
                                <a href={`tel:${pickup.phoneNumber}`} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-500 text-white text-[11px] font-black shadow-sm"><Phone size={14} /> 전화하기</a>
                                <a
                                  href={`sms:${pickup.phoneNumber}${students.find(s => s.name === pickup.studentName)?.smsMessage ? `?body=${encodeURIComponent(students.find(s => s.name === pickup.studentName)!.smsMessage)}` : ""}`}
                                  className="flex h-12 items-center justify-center gap-2 rounded-xl bg-sky-500 text-white text-[11px] font-black shadow-sm"
                                >
                                  <MessageSquare size={14} /> 문자 전송
                                </a>
                              </div>
                              <div className="p-4 rounded-2xl bg-slate-50 text-[11px] font-medium text-slate-600 leading-relaxed italic border border-slate-100">
                                {pickup.notes || "특이사항 없음"}
                              </div>
                              <div className="flex justify-end gap-2 pr-1">
                                <button onClick={(e) => { e.stopPropagation(); if (window.confirm("삭제할까요?")) deleteDoc(doc(db, "pickups", pickup.id)); }} className="text-[10px] font-bold text-rose-400 px-2 py-1">기록 삭제</button>
                                <button onClick={(e) => { e.stopPropagation(); handleOpenModal(pickup); }} className="text-[10px] font-bold text-slate-400 px-2 py-1">기록 수정</button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* PICKUP MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-[#1A2E44]/60 backdrop-blur-sm px-0">
          <div className="fixed inset-0" onClick={() => setIsModalOpen(false)} />
          <form
            onSubmit={handleSubmit}
            className="relative w-full max-w-xl rounded-t-[40px] bg-white shadow-2xl animate-in slide-in-from-bottom duration-500 flex flex-col max-h-[95vh]"
          >
            {/* COMPACT BANNER (1/4 size shortened to 1/2 of previous) */}
            <div className="bg-[#1A2E44] p-3 px-6 rounded-t-[38px] relative overflow-hidden shrink-0 border-b border-white/5">
              <div className="absolute top-0 right-0 h-16 w-16 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
              <div className="relative flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-white tracking-tight">이베아 유소년 <span className="text-[#FF6B00]">야구교실</span></h3>
                  <p className="text-[#FF6B00]/60 text-[8px] font-black uppercase tracking-widest">Pick-up Reservation</p>
                </div>
                <button type="button" onClick={() => setIsModalOpen(false)} className="h-7 w-7 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"><X size={14} /></button>
              </div>
            </div>

            <div className="px-6 pb-28 pt-5 space-y-6 overflow-y-auto no-scrollbar relative z-10">
              {/* STUDENT QUICK SELECT (Auto-fill) */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 ml-1"><Search size={11} className="text-[#FF6B00]" /> 등록 학생 정보 불러오기</label>
                <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar pr-4">
                  {students.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleStudentSelect(s)}
                      className={cn(
                        "shrink-0 px-4 py-2 rounded-full border text-[11px] font-bold transition-all",
                        formData.studentName === s.name ? "bg-[#FF6B00] border-[#FF6B00] text-white" : "bg-white border-slate-100 text-slate-500 hover:bg-slate-50"
                      )}
                    >
                      {s.name}
                    </button>
                  ))}
                  {students.length === 0 && <span className="text-[10px] text-slate-300 py-1 font-medium">등록된 학생이 없습니다. 우측 상단 '학생 관리'에서 먼저 등록해 주세요.</span>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">픽업 일자</label>
                  <input type="date" required className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 font-black text-slate-800 outline-none text-xs focus:border-[#FF6B00] transition-colors" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">시간</label>
                  <input type="time" required className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 font-black text-slate-800 outline-none text-xs focus:border-[#FF6B00] transition-colors" value={formData.time} onChange={(e) => setFormData({ ...formData, time: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">학생 이름</label>
                  <input type="text" required placeholder="홍길동" className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 font-black text-slate-800 outline-none text-xs focus:border-[#FF6B00] transition-colors" value={formData.studentName} onChange={(e) => setFormData({ ...formData, studentName: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">부모님 연락처</label>
                  <input type="tel" required placeholder="010-0000-0000" className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 font-black text-slate-800 outline-none text-xs focus:border-[#FF6B00] transition-colors" value={formData.phoneNumber} onChange={handlePhoneChange} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">출발지 (기본)</label>
                  <input type="text" required className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 font-black text-slate-800 outline-none text-xs focus:border-[#FF6B00] transition-colors" value={formData.departure} onChange={(e) => setFormData({ ...formData, departure: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">도착지 (기본)</label>
                  <input type="text" required className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 font-black text-slate-800 outline-none text-xs focus:border-[#FF6B00] transition-colors" value={formData.arrival} onChange={(e) => setFormData({ ...formData, arrival: e.target.value })} />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">기타 참고사항</label>
                <textarea rows={2} placeholder="특이사항을 입력하세요..." className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 font-black text-slate-800 outline-none text-xs focus:border-[#FF6B00] transition-colors resize-none" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
              </div>
            </div>

            {/* SLIM FOOTER BUTTONS FIX TO BOTTOM */}
            <div className="absolute bottom-4 left-4 right-4 flex gap-2">
              <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 h-12 rounded-xl bg-slate-100 text-[11px] font-black text-slate-400 active:bg-slate-200 transition-colors">닫기</button>
              <button
                type="button"
                onClick={(e) => handleSubmit(e, false)}
                className="flex-1 h-12 rounded-xl bg-slate-800 text-[11px] font-black text-white active:bg-slate-900 transition-colors"
              >
                {editingPickup ? "정보 수정" : "정보 저장"}
              </button>
              <button
                type="button"
                onClick={(e) => handleSubmit(e, true)}
                className="flex-[1.5] h-12 rounded-xl bg-[#FF6B00] text-[11px] font-black text-white shadow-lg shadow-orange-100 active:bg-orange-600 transition-colors flex items-center justify-center gap-2"
              >
                {editingPickup ? "운행 완료 처리" : "예약 완료"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STUDENT MANAGEMENT MODAL */}
      {isStudentModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[#1A2E44]/90 backdrop-blur-md p-5 animate-in fade-in duration-300">
          <div className="relative w-full max-w-lg rounded-[32px] bg-white p-6 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <header className="flex items-center justify-between mb-6 shrink-0">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-xl bg-[#1A2E44] flex items-center justify-center text-white shadow-lg"><UserPlus size={16} /></div>
                <h3 className="text-lg font-black text-[#1A2E44]">학생 정보 관리</h3>
              </div>
              <button onClick={() => setIsStudentModalOpen(false)} className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"><X size={18} /></button>
            </header>

            <form onSubmit={handleStudentSubmit} className="space-y-4 shrink-0 px-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 ml-1 tracking-tighter uppercase">학생 성명</label>
                  <input type="text" required className="w-full rounded-xl border border-slate-100 bg-slate-50 p-3.5 text-[11px] font-black outline-none focus:border-[#1A2E44] transition-colors" placeholder="홍길동" value={studentFormData.name} onChange={(e) => setStudentFormData({ ...studentFormData, name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 ml-1 tracking-tighter uppercase">부모님 연락처</label>
                  <input type="tel" required className="w-full rounded-xl border border-slate-100 bg-slate-50 p-3.5 text-[11px] font-black outline-none focus:border-[#1A2E44] transition-colors" placeholder="010-0000-0000" value={studentFormData.phoneNumber} onChange={(e) => handlePhoneChange(e, true)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 ml-1 tracking-tighter uppercase">기본 출발지</label>
                  <input type="text" required className="w-full rounded-xl border border-slate-100 bg-slate-50 p-3.5 text-[11px] font-black outline-none focus:border-[#1A2E44] transition-colors" value={studentFormData.defaultDeparture} onChange={(e) => setStudentFormData({ ...studentFormData, defaultDeparture: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 ml-1 tracking-tighter uppercase">기본 도착지</label>
                  <input type="text" required className="w-full rounded-xl border border-slate-100 bg-slate-50 p-3.5 text-[11px] font-black outline-none focus:border-[#1A2E44] transition-colors" value={studentFormData.defaultArrival} onChange={(e) => setStudentFormData({ ...studentFormData, defaultArrival: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 ml-1 tracking-tighter uppercase">참고사항</label>
                  <input type="text" className="w-full rounded-xl border border-slate-100 bg-slate-50 p-3.5 text-[11px] font-black outline-none focus:border-[#1A2E44] transition-colors" placeholder="특이사항 입력" value={studentFormData.notes} onChange={(e) => setStudentFormData({ ...studentFormData, notes: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 ml-1 tracking-tighter uppercase">SMS 메세지</label>
                  <input type="text" className="w-full rounded-xl border border-slate-100 bg-slate-50 p-3.5 text-[11px] font-black outline-none focus:border-[#1A2E44] transition-colors" placeholder="자동 발송 문구" value={studentFormData.smsMessage} onChange={(e) => setStudentFormData({ ...studentFormData, smsMessage: e.target.value })} />
                </div>
              </div>
              <button type="submit" className="w-full h-12 rounded-xl bg-[#1A2E44] text-white font-black text-xs shadow-lg flex items-center justify-center gap-2 mt-2 active:scale-[0.98] transition-all"><Save size={14} /> 학생 정보 저장하기</button>
            </form>

            <div className="mt-8 flex flex-col min-h-0">
              <h4 className="text-[11px] font-black text-[#1A2E44] mb-4 flex items-center gap-2 px-1 uppercase tracking-tighter"><Users size={12} className="text-[#FF6B00]" /> 보관된 학생 리스트 ({students.length})</h4>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {students.map(s => (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-2xl bg-white border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-slate-50 flex items-center justify-center text-[11px] font-black text-[#1A2E44] border border-slate-100">{s.name.slice(0, 1)}</div>
                      <div>
                        <p className="text-xs font-black text-[#1A2E44]">{s.name}</p>
                        <p className="text-[10px] font-bold text-slate-400 tracking-tight">{s.phoneNumber}</p>
                      </div>
                    </div>
                    <button onClick={() => { if (window.confirm("삭제할까요?")) deleteDoc(doc(db, "students", s.id)); }} className="h-8 w-8 rounded-lg bg-rose-50 flex items-center justify-center text-rose-400 hover:bg-rose-100 transition-colors"><X size={14} /></button>
                  </div>
                ))}
                {students.length === 0 && (
                  <div className="py-10 text-center">
                    <p className="text-[11px] font-bold text-slate-300">저장된 학생 정보가 없습니다.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
      {showToast && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[200] animate-in slide-in-from-bottom-5 duration-300">
          <div className="bg-[#1A2E44] text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-white/10">
            <div className="h-6 w-6 rounded-full bg-[#FF6B00] flex items-center justify-center">
              <Save size={12} strokeWidth={3} />
            </div>
            <p className="text-xs font-black">{toastMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}
