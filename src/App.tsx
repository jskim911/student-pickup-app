import { useState, useEffect } from "react";
import { Plus, Phone, MessageSquare, Save, ChevronRight, Users, UserPlus, X, Search, Home, Check, Trash2, Edit2, Car } from "lucide-react";
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
  runId: string;
  groupTitle: string;
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
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"pending" | "completed">("pending");
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("정보가 정상적으로 저장되었습니다.");
  const [tempReservedStudents, setTempReservedStudents] = useState<any[]>([]);

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
    status: "pending" as "pending" | "completed",
    runId: "",
    groupTitle: ""
  });

  const [studentFormData, setStudentFormData] = useState({
    name: "",
    phoneNumber: "",
    defaultDeparture: "2호점",
    defaultArrival: "2호점",
    notes: "",
    smsMessage: ""
  });

  // DYNAMIC TITLE GENERATOR (Based on System Time as requested)
  const generateGroupTitle = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const hour = now.getHours();
    const minutes = now.getMinutes();
    const timeStr = minutes === 0 ? `${hour}시` : `${hour}시 ${minutes}분`;
    return `${year}년 ${month}월 ${day}일 ${timeStr} 예약`;
  };

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
      console.log("Firebase initialized for project:", db.app.options.projectId);
      const qPickups = collection(db, "pickups"); // Fetch all to be safe from index issues
      const unsubPickups = onSnapshot(qPickups, (snapshot) => {
        try {
          const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Pickup[];
          // Safe sorting logic: handles missing date/time gracefully
          const sorted = data.sort((a, b) => {
            const dateA = a.date || "";
            const dateB = b.date || "";
            const timeA = a.time || "";
            const timeB = b.time || "";
            return dateB.localeCompare(dateA) || timeA.localeCompare(timeB);
          });
          setPickups(sorted);
          console.log(`Fetched ${data.length} pickups successfully.`);
        } catch (err) {
          console.error("Error processing pickups data:", err);
        }
      }, (error) => {
        console.error("Pickups listener error:", error);
        if (error.code === 'permission-denied') {
          alert("예약 내역을 읽어올 권한이 없습니다. 관리자에게 문의하세요.");
        }
      });

      const qStudents = query(collection(db, "students"), orderBy("name", "asc"));
      const unsubStudents = onSnapshot(qStudents, (snapshot) => {
        setStudents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Student[]);
      }, (error) => {
        console.error("Students listener error:", error);
        if (error.code === 'permission-denied') {
          // alert("데이터를 읽을 권한이 없습니다. 파이어베이스 보안 규칙 설정을 확인해 주세요.");
        }
      });

      const qUsers = query(collection(db, "users"), orderBy("createdAt", "desc"));
      const unsubUsers = onSnapshot(qUsers, async (snapshot) => {
        const fetchedUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as User[];
        // 타 앱(골프스코어 등) 사용자 필터링: username 필드가 명확히 있는 사용자만 이 앱의 사용자로 간주
        const validUsers = fetchedUsers.filter(u => u.username && u.username.trim() !== "");
        setUsers(validUsers);

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
        date: pickup.date || new Date().toLocaleDateString('sv-SE'),
        time: pickup.time,
        studentName: pickup.studentName,
        departure: pickup.departure,
        arrival: pickup.arrival,
        notes: pickup.notes,
        phoneNumber: pickup.phoneNumber,
        status: pickup.status || "pending",
        runId: pickup.runId || "",
        groupTitle: pickup.groupTitle || ""
      });
    } else {
      setEditingPickup(null);
      const today = new Date().toLocaleDateString('sv-SE');
      const defaultTime = "15:00";
      setFormData({
        date: today,
        time: defaultTime,
        studentName: "",
        departure: "2호점",
        arrival: "2호점",
        notes: "",
        phoneNumber: "",
        status: "pending",
        runId: "",
        groupTitle: generateGroupTitle()
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent, isManualComplete?: boolean | React.FormEvent, pickupToComplete?: Pickup) => {
    e.preventDefault();
    const targetPickup = pickupToComplete || editingPickup;

    try {
      // 1. QUICK COMPLETE (Status update only)
      if (typeof isManualComplete === "boolean" && isManualComplete && targetPickup) {
        await updateDoc(doc(db, "pickups", targetPickup.id), {
          status: "completed",
          updatedAt: serverTimestamp()
        });
        setToastMessage(`${targetPickup.studentName} 학생 운행 완료!`);
        setIsModalOpen(false);
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
        return;
      }

      // 2. CREATE NEW GROUP
      if (!targetPickup) {
        // Fix for "phantom data": If items were added to list, only save those items.
        // Don't accidentally add the current form state if it was already "added" to the list.
        let finalToSave = [...tempReservedStudents];

        // Only fallback to formData if the list is empty and user filled out the form but didn't click "Add"
        if (finalToSave.length === 0 && formData.studentName) {
          finalToSave.push({ ...formData });
        }

        if (finalToSave.length === 0) return alert("예약할 학생 정보를 추가해주세요.");

        const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const groupTitleCandidate = formData.groupTitle || generateGroupTitle();

        const promises = finalToSave.map(item => addDoc(collection(db, "pickups"), {
          ...item,
          runId,
          date: formData.date, // Apply group-wide date/time
          time: formData.time,
          groupTitle: groupTitleCandidate,
          status: "pending",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }));

        await Promise.all(promises);
        setToastMessage("예약이 정상적으로 완료되었습니다.");
      }
      // 3. GROUP EDITING
      else {
        // Sync tempReservedStudents list with Firestore for this runId
        const runId = targetPickup.runId;
        const currentInDb = pickups.filter(p => p.runId === runId);

        // Find which ones to delete (in DB but not in our temp list)
        const toDelete = currentInDb.filter(dbItem => !tempReservedStudents.find(t => t.id === dbItem.id));

        // Find which ones to update or create
        const toSave = tempReservedStudents;

        const promises = [
          ...toDelete.map(item => deleteDoc(doc(db, "pickups", item.id))),
          ...toSave.map(item => {
            const baseData = {
              studentName: item.studentName,
              phoneNumber: item.phoneNumber,
              departure: item.departure,
              arrival: item.arrival,
              notes: item.notes,
              date: formData.date, // Apply current modal's date/time to all
              time: formData.time,
              groupTitle: formData.groupTitle || targetPickup.groupTitle,
              updatedAt: serverTimestamp()
            };

            if (item.id) {
              // Update existing
              return updateDoc(doc(db, "pickups", item.id), baseData);
            } else {
              // Create new member in this group
              return addDoc(collection(db, "pickups"), {
                ...baseData,
                runId,
                status: "pending",
                createdAt: serverTimestamp()
              });
            }
          })
        ];

        await Promise.all(promises);
        setToastMessage("그룹 정보가 성공적으로 수정되었습니다.");
      }

      // Cleanup
      setTempReservedStudents([]);
      setFormData({
        ...formData,
        studentName: "",
        phoneNumber: "",
        notes: "",
        groupTitle: ""
      });
      setEditingPickup(null);
      setIsModalOpen(false);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (error) {
      console.error("Error saving pickups:", error);
      alert("데이터 저장 중 오류가 발생했습니다.");
    }
  };

  const handleStudentSubmit = async (e: React.FormEvent, isDone = false) => {
    e.preventDefault();
    try {
      if (editingStudent) {
        await updateDoc(doc(db, "students", editingStudent.id), studentFormData);
        setToastMessage("학생 정보가 수정되었습니다.");
      } else {
        await addDoc(collection(db, "students"), { ...studentFormData, createdAt: serverTimestamp() });
        setToastMessage("학생 정보가 등록되었습니다.");
      }

      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);

      if (isDone) {
        setStudentFormData({ name: "", phoneNumber: "", defaultDeparture: "2호점", defaultArrival: "2호점", notes: "", smsMessage: "" });
        setEditingStudent(null);
        setIsStudentModalOpen(false);
      } else {
        // Just clear for next entry if it was an "Add" action
        setStudentFormData({ name: "", phoneNumber: "", defaultDeparture: "2호점", defaultArrival: "2호점", notes: "", smsMessage: "" });
        setEditingStudent(null);
      }
    } catch (error: any) {
      console.error("Error saving student:", error);
      alert(`학생 저장 중 오류가 발생했습니다: ${error.message || "알 수 없는 오류"}`);
    }
  };

  const handleDeleteGroup = async (items: Pickup[]) => {
    if (!window.confirm(`이 예약 건의 모든 학생(${items.length}명) 정보를 삭제할까요?`)) return;
    try {
      const promises = items.map(item => deleteDoc(doc(db, "pickups", item.id)));
      await Promise.all(promises);
      setExpandedId(null);
    } catch (error) {
      console.error("Error deleting group:", error);
    }
  };

  const handleEditGroup = (items: Pickup[]) => {
    // We'll set the first item's group data to the modal
    const first = items[0];
    setEditingPickup(first);
    setTempReservedStudents(items.map(i => ({ ...i }))); // Load all students in the group
    setFormData({
      date: first.date,
      time: first.time,
      studentName: "", // Clear individual to add new or edit existing
      departure: first.departure,
      arrival: first.arrival,
      notes: "",
      phoneNumber: "",
      status: "pending",
      runId: first.runId,
      groupTitle: first.groupTitle
    });
    setIsModalOpen(true);
  };

  const handleToggleExpand = async (id: string | null) => {
    // If we are closing or switching from a currently expanded card
    if (expandedId && expandedId !== id) {
      const itemsToReset = pickups.filter(p => p.runId === expandedId && p.status === "completed");
      if (itemsToReset.length > 0) {
        try {
          const promises = itemsToReset.map(item =>
            updateDoc(doc(db, "pickups", item.id), {
              status: "pending",
              updatedAt: serverTimestamp()
            })
          );
          await Promise.all(promises);
        } catch (error) {
          console.error("Error resetting group status:", error);
        }
      }
    }
    setExpandedId(id);
  };

  const handleHomeClick = async () => {
    if (expandedId) {
      // Logic for reset happens inside handleToggleExpand when transition to null
      await handleToggleExpand(null);
    }
    setExpandedId(null);
    setIsAdminViewOpen(false);
    setActiveTab("pending");
    setIsModalOpen(false);
    setIsStudentModalOpen(false);
  };

  // GROUP BY RUN ID (Isolation)
  const groupedTasks = pickups.reduce((groups, pickup) => {
    // If no runId (legacy data), fallback to date_time
    const key = pickup.runId ? pickup.runId : `${pickup.date}_${pickup.time}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(pickup);
    return groups;
  }, {} as Record<string, Pickup[]>);

  // Filter groups for the current tab
  const displayGroupsForTab = Object.entries(groupedTasks).filter(([_, items]) => {
    const allCompleted = items.every(i => i.status === "completed");

    if (activeTab === "pending") {
      // In pending tab, hide groups where ALL students are completed
      return !allCompleted;
    } else {
      // In completed tab, only show groups that are fully completed
      return allCompleted;
    }
  }).reduce((obj, [k, v]) => ({ ...obj, [k]: v }), {} as Record<string, Pickup[]>);

  // Group current tab items by DATE for header display
  const finalDisplayGroups = Object.entries(displayGroupsForTab).reduce((groups, [key, items]) => {
    const date = items[0].date || "미지정";

    // In Pending tab, let's further filter: 
    // If we are in pending tab, and a group is allCompleted but NOT expanded, maybe hide it? 
    // No, let's keep all in pending but SORT them.
    const allCompleted = items.every(i => i.status === "completed");
    if (activeTab === "completed" && !allCompleted) return groups;

    if (!groups[date]) groups[date] = [];
    groups[date].push({ key, items });
    return groups;
  }, {} as Record<string, { key: string, items: Pickup[] }[]>);

  const formatGroupTitle = (dateStr: string, timeStr: string) => {
    if (!dateStr || dateStr === "미지정") return `${timeStr} 픽업`;
    // Manually parse YYYY-MM-DD to avoid timezone shifts
    const [year, month, day] = dateStr.split('-').map(Number);
    return `${year}년 ${month}월 ${day}일 ${timeStr} 픽업`;
  };

  const formatDateHeader = (dateStr: string) => {
    if (dateStr === "미지정") return dateStr;
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
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

      <div className="relative mx-auto max-w-2xl px-5 pt-8">
        <div className="sticky top-0 z-50 -mx-5 px-5 pt-8 pb-2 bg-[#F8FAFC]/80 backdrop-blur-xl border-b border-slate-100/50 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="space-y-0.5">
              <h1 className="text-lg font-black text-[#1A2E44] tracking-tight">이베아 유소년 <span className="text-[#FF6B00]">차량 운행 관리</span></h1>
              <p className="text-[8px] font-bold text-[#1A2E44]/30 uppercase tracking-[0.2em]">EB EA Youth Baseball Academy</p>
            </div>
            <button
              onClick={() => setCurrentUser(null)}
              className="px-3 py-1.5 rounded-lg bg-slate-100 text-[10px] font-bold text-slate-400 hover:text-rose-400 hover:bg-rose-50 transition-all uppercase tracking-widest border border-slate-200"
            >
              로그아웃
            </button>
          </div>

          {!isAdminViewOpen && (
            <header className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2">
              <button
                onClick={handleHomeClick}
                className={cn(
                  "shrink-0 h-10 w-10 flex items-center justify-center rounded-xl transition-all active:scale-95 border bg-white text-slate-800 border-slate-200 hover:bg-slate-100 shadow-sm"
                )}
                title="처음 리스트로"
              >
                <Home size={18} strokeWidth={2.5} />
              </button>

              <div className="flex flex-1 gap-1.5">
                {currentUser.username === "jskim119" && (
                  <button
                    onClick={() => setIsAdminViewOpen(!isAdminViewOpen)}
                    className={cn(
                      "flex-1 h-14 px-3 flex flex-col items-center justify-center rounded-xl font-black text-sm gap-0 transition-all border leading-tight",
                      isAdminViewOpen
                        ? "bg-[#FF6B00] text-white border-[#FF6B00] shadow-lg shadow-orange-500/10"
                        : "bg-white text-slate-800 border-slate-200 hover:bg-slate-50"
                    )}
                  >
                    <span>회원</span><span>관리</span>
                  </button>
                )}
                <>
                  <button
                    onClick={() => setIsStudentModalOpen(true)}
                    className="flex-1 h-14 px-3 flex flex-col items-center justify-center rounded-xl bg-white text-slate-800 border border-slate-200 hover:bg-slate-50 transition-all font-black text-sm gap-0 leading-tight"
                  >
                    <span>학생</span><span>관리</span>
                  </button>
                  <button
                    onClick={() => handleOpenModal()}
                    className="flex-[1.2] h-14 px-4 flex flex-col items-center justify-center rounded-xl bg-[#FF6B00] text-white shadow-lg shadow-orange-500/20 transition-all active:scale-95 font-black text-sm gap-0 leading-tight"
                  >
                    <span>운행</span><span>예약</span>
                  </button>
                </>
              </div>
            </header>
          )}
        </div>

        {isAdminViewOpen ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pt-2">
            {/* 승인 대기 섹션 */}
            <div>
              <div className="flex items-center justify-between px-2 mb-3">
                <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  📋 가입 승인 대기 <span className="text-[#FF6B00] text-sm font-black">({users.filter(u => !u.approved && u.role !== "admin").length}명)</span>
                </h2>
                <button
                  onClick={handleHomeClick}
                  className="h-9 w-9 flex items-center justify-center rounded-xl border bg-white text-slate-600 border-slate-200 hover:bg-slate-100 shadow-sm active:scale-95 transition-all"
                  title="돌아가기"
                >
                  <Home size={16} strokeWidth={2.5} />
                </button>
              </div>
              <div className="grid gap-2">
                {users.filter(u => !u.approved && u.role !== "admin").map(user => (
                  <div key={user.id} className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-orange-50 flex items-center justify-center text-[#FF6B00] font-black text-sm">{(user.username || "?").slice(0, 1)}</div>
                      <div>
                        <h3 className="text-sm font-black text-slate-800">{user.username || "이름없음"}</h3>
                        <p className="text-[9px] font-bold text-slate-400">요청일: {user.createdAt ? new Date((user.createdAt as any).seconds * 1000).toLocaleDateString() : "-"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => handleApproveUser(user.id)} className="px-3 py-1.5 rounded-lg bg-[#1A2E44] text-white text-[10px] font-black shadow active:scale-95 transition-all">승인</button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          const userId = user.id;
                          const userName = user.username || "이름없음";
                          if (!window.confirm(`[${userName}] 회원을 삭제할까요?`)) return;
                          try {
                            await deleteDoc(doc(db, "users", userId));
                            alert("삭제 완료! 페이지를 새로고침합니다.");
                            window.location.reload();
                          } catch (error: any) {
                            alert(`삭제 실패: ${error.code || error.message || JSON.stringify(error)}`);
                            console.error("Error deleting user:", error);
                          }
                        }}
                        className="h-8 w-8 rounded-lg flex items-center justify-center text-rose-300 hover:text-rose-500 hover:bg-rose-50 transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                {users.filter(u => !u.approved && u.role !== "admin").length === 0 && (
                  <div className="py-10 text-center rounded-2xl border-2 border-dashed border-slate-200 bg-white">
                    <p className="text-sm font-bold text-slate-400">승인 대기 중인 회원이 없습니다</p>
                  </div>
                )}
              </div>
            </div>

            {/* 승인된 회원 목록 */}
            <div>
              <div className="flex items-center justify-between px-2 mb-4">
                <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  👥 승인된 회원 <span className="text-[#1A2E44]/50 text-sm font-black">({users.filter(u => u.approved && u.role !== "admin").length}명)</span>
                </h2>
              </div>
              <div className="grid gap-3">
                {users.filter(u => u.approved && u.role !== "admin").map(user => (
                  <div key={user.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-500 font-black">{(user.username || "?").slice(0, 1)}</div>
                      <div>
                        <h3 className="text-sm font-black text-slate-800">{user.username || "이름없음"}</h3>
                        <p className="text-[10px] font-bold text-green-500">승인됨</p>
                      </div>
                    </div>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (!window.confirm(`${user.username || "이 회원"}을 삭제할까요?`)) return;
                        try {
                          await deleteDoc(doc(db, "users", user.id));
                          alert("삭제 완료! 페이지를 새로고침합니다.");
                          window.location.reload();
                        } catch (error: any) {
                          alert(`삭제 실패: ${error.code || error.message || JSON.stringify(error)}`);
                          console.error("Error deleting user:", error);
                        }
                      }}
                      className="h-9 w-9 rounded-xl flex items-center justify-center text-rose-300 hover:text-rose-500 hover:bg-rose-50 transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                {users.filter(u => u.approved && u.role !== "admin").length === 0 && (
                  <div className="py-12 text-center rounded-[28px] border-2 border-dashed border-slate-200 bg-white">
                    <p className="text-sm font-bold text-slate-400">승인된 회원이 없습니다</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* TAB NAVIGATION */}
            <div className="flex gap-4 mb-6 px-1">
              <button
                onClick={() => { setActiveTab("pending"); setExpandedId(null); }}
                className={cn(
                  "text-sm font-black transition-all pb-2 border-b-2",
                  activeTab === "pending" ? "text-white border-[#FF6B00]" : "text-white/40 border-transparent"
                )}
              >
                예약 리스트
              </button>
              <button
                onClick={() => { setActiveTab("completed"); setExpandedId(null); }}
                className={cn(
                  "text-sm font-black transition-all pb-2 border-b-2",
                  activeTab === "completed" ? "text-white border-[#FF6B00]" : "text-white/40 border-transparent"
                )}
              >
                운행 완료
              </button>
            </div>

            <div className="space-y-6">
              {Object.keys(displayGroupsForTab).length === 0 ? (
                <div className="rounded-[40px] border-2 border-dashed border-slate-200 py-24 text-center bg-white/40">
                  <p className="font-bold text-slate-400 text-sm">
                    {activeTab === "pending" ? "현재 예약된 내역이 없습니다" : "완료된 운행 내역이 없습니다"}
                  </p>
                </div>
              ) : (
                Object.entries(finalDisplayGroups).sort((a, b) => b[0].localeCompare(a[0])).map(([date, groups]) => (
                  <div key={date} className="space-y-4">
                    <div className="flex items-center gap-3 px-2">
                      <span className="text-[11px] font-black text-[#1A2E44]/50 tracking-tighter uppercase">{formatDateHeader(date)}</span>
                      <div className="h-[1px] flex-1 bg-slate-200" />
                    </div>

                    {groups.sort((a, b) => {
                      const aDone = a.items.every(i => i.status === "completed");
                      const bDone = b.items.every(i => i.status === "completed");
                      if (aDone !== bDone) return aDone ? 1 : -1;
                      return a.items[0].time.localeCompare(b.items[0].time);
                    }).map(({ key, items }) => {
                      const time = items[0].time;
                      const pendingItems = items.filter(i => i.status === "pending");
                      const currentItem = pendingItems[0] || items[items.length - 1];

                      if (activeTab === "completed") {
                        // SIMPLIFIED LOG VIEW FOR COMPLETED TAB
                        return (
                          <div
                            key={key}
                            className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300"
                          >
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
                                <Check size={16} strokeWidth={3} />
                              </div>
                              <p className="text-sm font-black text-slate-600">
                                {items[0].groupTitle || formatGroupTitle(items[0].date, time)} 완료
                              </p>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteGroup(items); }}
                              className="h-9 w-9 rounded-xl flex items-center justify-center text-rose-300 hover:text-rose-500 hover:bg-rose-50 transition-all"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={key}
                          className={cn(
                            "bg-white rounded-[32px] border border-slate-100 transition-all cursor-pointer overflow-hidden",
                            expandedId === key ? "shadow-xl ring-2 ring-[#FF6B00]/10" : "shadow-sm hover:shadow-md"
                          )}
                          onClick={() => handleToggleExpand(expandedId === key ? null : key)}
                        >
                          {/* COMPACT GROUP HEADER */}
                          <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3 overflow-hidden">
                              <div className={cn(
                                "h-11 w-11 shrink-0 rounded-2xl flex items-center justify-center font-black transition-all",
                                "bg-[#FF6B00] text-white shadow-lg shadow-orange-500/20"
                              )}>
                                <Car size={20} strokeWidth={3} />
                              </div>
                              <div className="overflow-hidden">
                                <h3 className="text-sm font-black text-slate-800 leading-none mb-1 truncate">
                                  {items[0].groupTitle || formatGroupTitle(items[0].date, time)}
                                </h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                                  총 {items.length}명 (대기: {pendingItems.length}명)
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleEditGroup(items); }}
                                className="h-8 w-8 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-slate-100 hover:text-blue-500 transition-all border border-slate-100"
                              >
                                <Edit2 size={13} strokeWidth={3} />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteGroup(items); }}
                                className="h-8 w-8 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-slate-100 hover:text-rose-500 transition-all border border-slate-100"
                              >
                                <Trash2 size={13} strokeWidth={3} />
                              </button>
                              <div className="ml-1 w-[20px] h-[20px] flex items-center justify-center">
                                <ChevronRight size={16} className={cn("text-slate-300 transition-transform", expandedId === key && "rotate-90")} />
                              </div>
                            </div>
                          </div>

                          {/* ADVANCED SEQUENTIAL VIEW */}
                          {expandedId === key && (
                            <div className="px-4 pb-5 pt-0 animate-in slide-in-from-top-2 duration-300 space-y-4">

                              {/* 1. PROGRESS TRACKER (Combined Completed + Next Student) */}
                              {activeTab === "pending" && (
                                <div className="grid grid-cols-4 gap-1.5 mt-2 mb-4">
                                  {items.map((i, idx) => {
                                    const isCompleted = i.status === "completed";
                                    const currentIndex = items.findIndex(item => item.id === currentItem?.id);

                                    // Sequence Logic: Show all students up to the current one
                                    if (currentIndex === -1 || idx > currentIndex) return null;

                                    return (
                                      <div
                                        key={i.id}
                                        className={cn(
                                          "h-8 px-1 rounded-xl flex items-center justify-center border transition-all shadow-sm",
                                          isCompleted ? "bg-[#F8FAFC] border-slate-100" : "bg-orange-50 border-[#FF6B00]/40 ring-1 ring-[#FF6B00]/10"
                                        )}
                                      >
                                        <span className={cn(
                                          "text-[10px] font-black leading-none text-center truncate px-0.5 w-full",
                                          isCompleted ? "text-slate-400" : "text-[#FF6B00]"
                                        )}>
                                          {i.studentName || (i as any).name || "학생"}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* 2. CURRENT STUDENT CARD */}
                              {currentItem && pendingItems.length > 0 && (
                                <div className="bg-slate-50/50 rounded-[24px] p-4 border border-slate-100">
                                  <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                      <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center text-[#1A2E44] font-black shadow-sm">
                                        {currentItem.studentName.slice(0, 1)}
                                      </div>
                                      <div>
                                        <h4 className="text-base font-black text-slate-800 leading-none">{currentItem.studentName}</h4>
                                        <span className="text-[10px] font-bold text-[#FF6B00] uppercase">{currentItem.departure} → {currentItem.arrival}</span>
                                      </div>
                                    </div>
                                    <div className="flex gap-1">
                                      <button onClick={(e) => { e.stopPropagation(); if (window.confirm("기록을 삭제할까요?")) deleteDoc(doc(db, "pickups", currentItem.id)); }} className="h-8 w-8 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center hover:bg-rose-100 transition-colors"><Trash2 size={12} /></button>
                                      <button onClick={(e) => { e.stopPropagation(); handleOpenModal(currentItem); }} className="h-8 w-8 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center hover:bg-blue-100 transition-colors"><Edit2 size={12} /></button>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2 mb-4">
                                    <a href={`tel:${currentItem.phoneNumber}`} onClick={e => e.stopPropagation()} className="flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-800 text-white text-[11px] font-black"><Phone size={12} /> 전화</a>
                                    <a
                                      href={`sms:${currentItem.phoneNumber}${students.find(s => s.name === currentItem.studentName)?.smsMessage ? `?body=${encodeURIComponent(students.find(s => s.name === currentItem.studentName)!.smsMessage)}` : ""}`}
                                      onClick={e => e.stopPropagation()}
                                      className="flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-200 text-slate-800 text-[11px] font-black"
                                    >
                                      <MessageSquare size={12} /> 문자
                                    </a>
                                  </div>

                                  <div className="p-3 rounded-xl bg-white border border-slate-100 text-[11px] font-medium text-slate-600 mb-4">
                                    {currentItem.notes || "특이사항 없음"}
                                  </div>

                                  <div className="space-y-3">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleSubmit(e as any, true, currentItem); }}
                                      className="w-full h-12 rounded-2xl bg-[#FF6B00] text-white text-[12px] font-black shadow-lg shadow-orange-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                    >
                                      {pendingItems.length > 1 ? `완료 (다음: ${pendingItems[1].studentName})` : "마지막 학생 완료"}
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleToggleExpand(null); }}
                                      className="w-full h-10 rounded-2xl bg-white border border-slate-200 text-slate-400 text-[11px] font-bold active:scale-[0.98] transition-all"
                                    >
                                      운행 취소 및 리스트로
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* 3. FINAL END DRIVING BUTTON (When all are done in pending tab) */}
                              {pendingItems.length === 0 && (
                                <div className="space-y-4 animate-in zoom-in-95 duration-500">
                                  <div className="p-8 text-center rounded-[32px] bg-slate-50 border-2 border-dashed border-slate-200">
                                    <div className="h-16 w-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-slate-100">
                                      <Check size={32} className="text-[#FF6B00]" strokeWidth={3} />
                                    </div>
                                    <h4 className="text-base font-black text-slate-800 mb-1">모든 운행 완료!</h4>
                                    <p className="text-xs font-bold text-slate-400">운행 종료 버튼을 눌러 기록을 저장하세요.</p>
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedId(null);
                                      setActiveTab("completed");
                                      setToastMessage("운행이 성공적으로 종료되어 기록되었습니다.");
                                      setShowToast(true);
                                      setTimeout(() => setShowToast(false), 3000);
                                    }}
                                    className="w-full h-16 rounded-[24px] bg-[#1A2E44] text-white text-[15px] font-black shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                                  >
                                    운행 종료 및 기록 저장 <ChevronRight size={20} strokeWidth={3} />
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* PICKUP MODAL */}
      {
        isModalOpen && (
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
                    <input type="date" className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 font-black text-slate-800 outline-none text-xs focus:border-[#FF6B00] transition-colors" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">시간</label>
                    <input type="time" className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 font-black text-slate-800 outline-none text-xs focus:border-[#FF6B00] transition-colors" value={formData.time} onChange={(e) => setFormData({ ...formData, time: e.target.value })} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-[#FF6B00] uppercase tracking-widest ml-1">예약 리스트 제목 (수정 가능)</label>
                  <input
                    type="text"
                    placeholder="예: 2026년 3월 4일 15:00 픽업"
                    className="w-full rounded-2xl border-2 border-orange-100 bg-orange-50/30 p-4 font-black text-slate-800 outline-none text-xs focus:border-[#FF6B00] transition-all"
                    value={formData.groupTitle}
                    onChange={(e) => setFormData({ ...formData, groupTitle: e.target.value })}
                  />
                  <p className="text-[9px] font-bold text-slate-400 ml-1 mt-1">* 리스트에서 보여질 제목입니다. 자유롭게 수정하세요.</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">학생 이름</label>
                    <input type="text" placeholder="홍길동" className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 font-black text-slate-800 outline-none text-xs focus:border-[#FF6B00] transition-colors" value={formData.studentName} onChange={(e) => setFormData({ ...formData, studentName: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">부모님 연락처</label>
                    <input type="tel" placeholder="010-0000-0000" className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 font-black text-slate-800 outline-none text-xs focus:border-[#FF6B00] transition-colors" value={formData.phoneNumber} onChange={handlePhoneChange} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">출발지 (기본)</label>
                    <input type="text" className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 font-black text-slate-800 outline-none text-xs focus:border-[#FF6B00] transition-colors" value={formData.departure} onChange={(e) => setFormData({ ...formData, departure: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">도착지 (기본)</label>
                    <input type="text" className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 font-black text-slate-800 outline-none text-xs focus:border-[#FF6B00] transition-colors" value={formData.arrival} onChange={(e) => setFormData({ ...formData, arrival: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">기타 참고사항</label>
                  <textarea rows={2} placeholder="특이사항을 입력하세요..." className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 font-black text-slate-800 outline-none text-xs focus:border-[#FF6B00] transition-colors resize-none" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
                </div>

                {/* SEQUENTIAL LIST OF ADDED STUDENTS (Requested) */}
                {tempReservedStudents.length > 0 && (
                  <div className="pt-4 space-y-3">
                    <label className="text-[10px] font-black text-[#FF6B00] uppercase tracking-widest ml-1">추가된 예약 명단 ({tempReservedStudents.length}명)</label>
                    <div className="grid gap-2">
                      {tempReservedStudents.map((item, index) => (
                        <div key={index} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100 animate-in slide-in-from-left-2 duration-300">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl bg-white flex items-center justify-center text-[12px] font-black text-slate-800 shadow-sm border border-slate-100">{index + 1}</div>
                            <div>
                              <p className="text-[12px] font-black text-slate-800">{item.studentName}</p>
                              <p className="text-[9px] font-bold text-slate-400">{item.time} | {item.departure} → {item.arrival}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setTempReservedStudents(tempReservedStudents.filter((_, i) => i !== index))}
                            className="h-9 w-9 rounded-xl flex items-center justify-center text-rose-300 hover:text-rose-500 hover:bg-white transition-all shadow-sm"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* FOOTER BUTTONS */}
              <div className="shrink-0 p-6 pt-2 pb-8 flex gap-2 bg-white">
                <button
                  type="button"
                  onClick={() => {
                    if (!formData.studentName) return alert("학생 성명을 입력하거나 선택해주세요.");
                    if (!formData.phoneNumber) return alert("연락처를 입력해주세요.");
                    setTempReservedStudents([...tempReservedStudents, { ...formData }]);
                    setFormData({ ...formData, studentName: "", phoneNumber: "", notes: "" });
                    setToastMessage(`${formData.studentName} 학생이 목록에 추가되었습니다.`);
                    setShowToast(true);
                    setTimeout(() => setShowToast(false), 2000);
                  }}
                  className="flex-1 h-14 rounded-2xl bg-[#1A2E44] text-white text-[13px] font-black shadow-lg shadow-blue-900/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <Plus size={18} strokeWidth={3} /> 추가
                </button>

                {(tempReservedStudents.length > 0 || editingPickup) && (
                  <button
                    type="submit"
                    className="flex-1 h-14 rounded-2xl bg-[#FF6B00] text-white text-[13px] font-black shadow-lg shadow-orange-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                    <Check size={18} strokeWidth={3} /> {editingPickup ? "수정 완료" : "예약 완료"}
                  </button>
                )}
              </div>
            </form>
          </div>
        )
      }

      {/* STUDENT MANAGEMENT MODAL */}
      {
        isStudentModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-white/50 backdrop-blur-sm px-4 py-8 animate-in fade-in duration-300" style={{ left: 0, right: 0, top: 0, bottom: 0 }}>
            <div className="relative w-full max-w-2xl rounded-[32px] bg-white shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] border border-slate-100 overflow-hidden flex flex-col h-full max-h-[94vh] mx-auto">
              <header className="flex items-center justify-between px-6 py-4 shrink-0 border-b border-slate-50 bg-white">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-slate-800 flex items-center justify-center text-white shadow-lg shadow-slate-200"><UserPlus size={18} /></div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 tracking-tight">학생 정보 관리</h3>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Student Database</p>
                  </div>
                </div>
                <button onClick={() => { setIsStudentModalOpen(false); setEditingStudent(null); setStudentFormData({ name: "", phoneNumber: "", defaultDeparture: "2호점", defaultArrival: "2호점", notes: "", smsMessage: "" }); }} className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-all"><X size={18} /></button>
              </header>

              <form onSubmit={(e) => handleStudentSubmit(e, false)} className="space-y-3 shrink-0 px-6 py-3 bg-slate-50/50">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 ml-1 tracking-wider uppercase">학생 성명</label>
                    <input type="text" required className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-bold outline-none focus:border-[#1A2E44] transition-all placeholder:text-slate-300" placeholder="홍길동" value={studentFormData.name} onChange={(e) => setStudentFormData({ ...studentFormData, name: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 ml-1 tracking-wider uppercase">부모님 연락처</label>
                    <input type="tel" required className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-bold outline-none focus:border-[#1A2E44] transition-all placeholder:text-slate-300" placeholder="010-0000-0000" value={studentFormData.phoneNumber} onChange={(e) => handlePhoneChange(e, true)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 ml-1 tracking-wider uppercase">기본 출발지</label>
                    <input type="text" required className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-bold outline-none focus:border-[#1A2E44] transition-all" value={studentFormData.defaultDeparture} onChange={(e) => setStudentFormData({ ...studentFormData, defaultDeparture: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 ml-1 tracking-wider uppercase">기본 도착지</label>
                    <input type="text" required className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-bold outline-none focus:border-[#1A2E44] transition-all" value={studentFormData.defaultArrival} onChange={(e) => setStudentFormData({ ...studentFormData, defaultArrival: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 ml-1 tracking-wider uppercase">참고사항</label>
                    <textarea rows={1} className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-bold outline-none focus:border-[#1A2E44] transition-all resize-none placeholder:text-slate-300 min-h-[40px]" placeholder="특이사항 입력" value={studentFormData.notes} onChange={(e) => setStudentFormData({ ...studentFormData, notes: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 ml-1 tracking-wider uppercase">SMS 메세지</label>
                    <textarea rows={1} className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-bold outline-none focus:border-[#1A2E44] transition-all resize-none placeholder:text-slate-300 min-h-[40px]" placeholder="자동 발송 문구" value={studentFormData.smsMessage} onChange={(e) => setStudentFormData({ ...studentFormData, smsMessage: e.target.value })} />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  {editingStudent ? (
                    <>
                      <button
                        type="button"
                        onClick={(e) => handleStudentSubmit(e, false)}
                        className="flex-1 h-10 rounded-xl bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg"
                      >
                        <Save size={14} /> 수정
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingStudent(null);
                          setStudentFormData({ name: "", phoneNumber: "", defaultDeparture: "2호점", defaultArrival: "2호점", notes: "", smsMessage: "" });
                        }}
                        className="flex-1 h-10 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs flex items-center justify-center gap-2 active:scale-95 transition-all bg-white"
                      >
                        <Plus size={14} /> 신규 입력
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => handleStudentSubmit(e, false)}
                      className="flex-1 h-10 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs flex items-center justify-center gap-2 active:scale-95 transition-all bg-white hover:bg-slate-50"
                    >
                      <Plus size={14} /> 추가
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => handleStudentSubmit(e, true)}
                    className="flex-[0.8] h-10 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs flex items-center justify-center gap-2 active:scale-95 transition-all hover:bg-slate-200 border border-slate-200"
                  >
                    <Check size={14} /> 완료
                  </button>
                </div>
              </form>

              <div className="flex-1 overflow-hidden flex flex-col min-h-0 bg-white">
                <div className="px-6 py-3 flex items-center justify-between shrink-0 border-b border-slate-50">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-3.5 bg-[#FF6B00] rounded-full"></div>
                    <h4 className="text-[11px] font-bold text-[#1A2E44] uppercase tracking-wider">보관된 학생 리스트 ({students.length})</h4>
                  </div>
                  <button type="button" onClick={() => window.location.reload()} className="text-[9px] font-bold text-slate-400 hover:text-[#FF6B00] transition-colors flex items-center gap-1.5"><Search size={9} /> 새로고침</button>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2 custom-scrollbar">
                  <div className="grid grid-cols-4 gap-2">
                    {students.map(s => (
                      <div
                        key={s.id}
                        onClick={() => {
                          setEditingStudent(s);
                          setStudentFormData({
                            name: s.name,
                            phoneNumber: s.phoneNumber,
                            defaultDeparture: s.defaultDeparture,
                            defaultArrival: s.defaultArrival,
                            notes: s.notes || "",
                            smsMessage: s.smsMessage || ""
                          });
                        }}
                        className={cn(
                          "relative flex flex-col items-center justify-center p-2 rounded-xl border transition-all cursor-pointer aspect-square text-center",
                          editingStudent?.id === s.id ? "bg-slate-800 border-slate-800 text-white shadow-lg" : "bg-white border-slate-100 shadow-sm hover:border-slate-200 hover:bg-slate-50"
                        )}
                      >
                        <div className={cn("h-6 w-6 rounded-lg mb-1 flex items-center justify-center text-[10px] font-bold shrink-0", editingStudent?.id === s.id ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400")}>{s.name.slice(0, 1)}</div>
                        <p className="text-[10px] font-bold truncate w-full px-1">{s.name}</p>
                        <button
                          onClick={(e) => { e.stopPropagation(); if (window.confirm("삭제할까요?")) deleteDoc(doc(db, "students", s.id)); }}
                          className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-lg hover:bg-rose-600 transition-colors z-10"
                          title="삭제"
                        >
                          <X size={10} strokeWidth={3} />
                        </button>
                      </div>
                    ))}
                  </div>
                  {students.length === 0 && (
                    <div className="py-10 text-center">
                      <p className="text-[11px] font-bold text-slate-300">저장된 학생 정보가 없습니다.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* TOAST NOTIFICATION */}
      {
        showToast && (
          <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[200] animate-in slide-in-from-bottom-5 duration-300">
            <div className="bg-[#1A2E44] text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-white/10">
              <div className="h-6 w-6 rounded-full bg-[#FF6B00] flex items-center justify-center">
                <Save size={12} strokeWidth={3} />
              </div>
              <p className="text-xs font-black">{toastMessage}</p>
            </div>
          </div>
        )
      }
    </div >
  );
}
